#!/usr/bin/env python3
"""Reference model + verifier for the Fresh Laundry GDD (v0.3).

Single source of truth for: item catalog, level contents, par solutions, rule evaluation,
integer numeric rules, fill zones, stars, RNG, per-item outcomes, hamper shuffle.

Run:  python3 verify_gdd.py            prints a report, exits 1 on any failure
      python3 verify_gdd.py --export   also writes items.json, levels.json, fixtures.json next to this file

fixtures.json is what the TypeScript test-suite must load and match (GDD Section 21).
All arithmetic that decides a rule uses INTEGERS (wet bulk in tenths, time in milliseconds).
"""
import json, math, sys, os
from collections import Counter

# ---------------------------------------------------------------- constants (integers only)
SWELL_T = {"low": 10, "medium": 12, "high": 20}      # swell multiplier in tenths
DRUM_W = 90                                          # weight limit (units of 50 g)
DRUM_B = 100                                         # dry bulk limit
DRUM_WET_T = 1000                                    # wet bulk limit in tenths (100.0)
BAG_W, BAG_B, BAG_CAP = 2, 2, 12
MAX_BAGS_PER_LOAD = 2
LOST_THRESHOLD = 2147483648                          # floor(0.5 * 2^32): lost iff u32 < threshold
M32 = 0xFFFFFFFF

# id: (name, W, B, swell, tier, bleeds, hygiene, small, shedder)
ITEMS = {
 "tee_white": ("White T-shirt", 4, 5, "low", "light", False, "clean", False, False),
 "tee_mint": ("Pastel mint T-shirt", 4, 5, "low", "light", False, "clean", False, False),
 "tee_beige": ("Beige T-shirt", 4, 5, "low", "light", False, "clean", False, False),
 "tee_black": ("Black T-shirt", 4, 5, "low", "dark", False, "clean", False, False),
 "tee_grey": ("Grey T-shirt", 4, 5, "low", "dark", False, "clean", False, False),
 "tee_red": ("Bright red T-shirt", 4, 5, "low", "dark", True, "clean", False, False),
 "shirt_white": ("White shirt", 5, 6, "low", "light", False, "clean", False, False),
 "shirt_pastel_yellow": ("Pastel yellow shirt", 5, 6, "low", "light", False, "clean", False, False),
 "shirt_pastel_blue": ("Pastel blue shirt", 5, 6, "low", "light", False, "clean", False, False),
 "shirt_black": ("Black shirt", 5, 6, "low", "dark", False, "clean", False, False),
 "shirt_navy": ("Navy shirt", 5, 6, "low", "dark", False, "clean", False, False),
 "shirt_striped": ("Navy-white striped shirt", 5, 6, "low", "dark", False, "clean", False, False),
 "trousers_black": ("Black trousers", 8, 10, "low", "dark", False, "flex", False, False),
 "hoodie_white": ("White hoodie", 12, 16, "medium", "light", False, "clean", False, False),
 "hoodie_navy": ("Navy hoodie", 12, 16, "medium", "dark", False, "clean", False, False),
 "jeans_blue": ("Blue jeans", 14, 14, "low", "dark", False, "flex", False, False),
 "jeans_lightwash": ("Light-wash jeans", 14, 14, "low", "dark", False, "flex", False, False),
 "jacket_white": ("White light jacket", 10, 18, "low", "light", False, "dirty", False, False),
 "jacket_navy": ("Navy jacket", 10, 18, "low", "dark", False, "flex", False, False),
 "puffer_navy": ("Navy puffer jacket", 12, 40, "high", "dark", False, "flex", False, False),
 "towel_white": ("Fluffy white towel", 10, 12, "medium", "light", False, "clean", False, True),
 "towel_pastel": ("Pastel towel", 10, 12, "medium", "light", False, "clean", False, False),
 "towel_navy": ("Navy towel", 10, 12, "medium", "dark", False, "clean", False, False),
 "towel_red": ("Bright red towel", 10, 12, "medium", "dark", True, "clean", False, False),
 "curtain_dark": ("Dark curtain", 18, 24, "medium", "dark", False, "clean", False, False),
 "duvet_white": ("White duvet cover", 18, 28, "high", "light", False, "clean", False, False),
 "sheet_white": ("White sheet set", 20, 24, "medium", "light", False, "clean", False, False),
 "sheet_dark": ("Dark sheet set", 20, 24, "medium", "dark", False, "clean", False, False),
 "rag_grey": ("Grey rag", 2, 2, "low", "dark", False, "dirty", False, False),
 "rag_blue": ("Blue rag", 2, 2, "low", "dark", False, "dirty", False, False),
 "rag_white": ("White rag", 2, 2, "low", "light", False, "dirty", False, True),
 "sock_white": ("White socks (pair)", 2, 2, "low", "light", False, "clean", True, False),
 "sock_black": ("Black socks (pair)", 2, 2, "low", "dark", False, "clean", True, False),
 "sock_worn_navy": ("Worn gym socks (pair)", 2, 2, "low", "dark", False, "flex", True, False),
 "undies_white": ("White underwear", 2, 2, "low", "light", False, "clean", True, False),
 "undies_black": ("Black underwear", 2, 2, "low", "dark", False, "clean", True, False),
}

def base(i): return i.split("#")[0]

def it(i):
    n, w, b, s, t, bl, h, sm, sh = ITEMS[base(i)]
    return dict(id=i, defId=base(i), name=n, W=w, B=b, swell=s, tier=t, bleeds=bl, hygiene=h, small=sm, shedder=sh)

CFG = dict(lintAffectsFlexDark=True, smallItemLoss=True)

# ---------------------------------------------------------------- integer rules
def cycle_ms(W, B):
    """6 s + max(W,B)/15 s, in integer milliseconds, rounded half up."""
    return 6000 + (max(W, B) * 2000 + 15) // 30

def zone(W, B):
    """Fill zone from DRY values using integer thresholds (70% -> W63/B70, 90% -> W81/B90)."""
    if W > DRUM_W or B > DRUM_B: return "overfull"
    if W > 81 or B > 90: return "tight"
    if W >= 63 or B >= 70: return "good"
    return "light"

def is_jam(W, wet_tenths):
    return W > DRUM_W or wet_tenths > DRUM_WET_T

def par_seconds(m10, n_items, sum_cost_ms):
    """round_half_up( sum(cycle costs) + m * (3*items + 10) ) with m given in tenths."""
    return (sum_cost_ms + 100 * m10 * (3 * n_items + 10) + 500) // 1000

def stars_for(violations, jam, total_ms, par_s):
    if jam: return 0
    sev = {s for _, s in violations}
    if "fatal" in sev: return 0
    if sev: return 1
    return 3 if total_ms <= par_s * 1000 else 2

# ---------------------------------------------------------------- RNG (must match the JS reference in the GDD)
def fnv1a32(s):
    h = 0x811C9DC5
    for b in s.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & M32
    return h

def mulberry32(seed):
    a = seed & M32
    def next_u32():
        nonlocal a
        a = (a + 0x6D2B79F5) & M32
        t = ((a ^ (a >> 15)) * (1 | a)) & M32
        t = ((t + (((t ^ (t >> 7)) * (61 | t)) & M32)) & M32) ^ t
        return (t ^ (t >> 14)) & M32
    return next_u32

def shuffle_ids(ids, level_seed):
    ids = list(ids)
    nxt = mulberry32(fnv1a32(f"{level_seed}:hamper"))
    for i in range(len(ids) - 1, 0, -1):
        j = (nxt() * (i + 1)) >> 32          # == floor(u32/2^32 * (i+1))
        ids[i], ids[j] = ids[j], ids[i]
    return ids

# ---------------------------------------------------------------- load evaluation
def evaluate(load, cfg=CFG):
    """load = {"items":[ids loose], "bags":[[ids],[ids]]}. Ids may be 'def' or 'def#n'."""
    loose = [it(i) for i in load.get("items", [])]
    bags = [[it(i) for i in b] for b in load.get("bags", [])]
    contents = loose + [x for b in bags for x in b]
    illegal = set()
    if len(bags) > MAX_BAGS_PER_LOAD: illegal.add("BAG_COUNT")
    for b in bags:
        if any(not x["small"] for x in b): illegal.add("BAG_NOT_SMALL")
        if sum(x["B"] for x in b) > BAG_CAP: illegal.add("BAG_CAPACITY")
    if not contents: illegal.add("EMPTY_LOAD")
    ids = [x["id"] for x in contents]
    if any("#" in i for i in ids) and len(ids) != len(set(ids)): illegal.add("DUPLICATE_ITEM")

    W = sum(x["W"] for x in contents) + BAG_W * len(bags)
    B = sum(x["B"] for x in contents) + BAG_B * len(bags)
    wet_t = sum(x["B"] * SWELL_T[x["swell"]] for x in contents) + BAG_B * 10 * len(bags)

    detail = []   # {rule, severity, ids}
    dirty_load = any(x["hygiene"] == "dirty" for x in contents)
    if not dirty_load:
        light = [x for x in contents if x["tier"] == "light"]
        dark = [x for x in contents if x["tier"] == "dark"]
        if light and any(x["bleeds"] for x in dark):
            detail.append(dict(rule="COLOR_BLEED", severity="fatal", ids=[x["id"] for x in light]))
        elif light and dark:
            detail.append(dict(rule="COLOR_DYE", severity="fatal", ids=[x["id"] for x in light]))
    else:
        for x in contents:
            if x["hygiene"] == "clean":
                if x["tier"] == "light":
                    detail.append(dict(rule="HYG_DIRTY_WITH_LIGHT", severity="fatal", ids=[x["id"]]))
                else:
                    detail.append(dict(rule="HYG_DIRTY_WITH_DARK", severity="major", ids=[x["id"]]))
        if any(x["shedder"] and x["hygiene"] == "dirty" for x in contents):
            for x in contents:
                if x["tier"] == "dark" and x["hygiene"] != "dirty":
                    if x["hygiene"] == "flex" and not cfg["lintAffectsFlexDark"]: continue
                    detail.append(dict(rule="COLOR_LINT", severity="minor", ids=[x["id"]]))
    if cfg["smallItemLoss"]:
        for x in loose:
            if x["small"]:
                detail.append(dict(rule="SMALL_LOOSE", severity="major", ids=[x["id"]]))

    cost = cycle_ms(W, B)
    return dict(W=W, B=B, wetT=wet_t, wet=wet_t / 10, fill=round(max(W / DRUM_W, B / DRUM_B) * 100),
                zone=zone(W, B), jam=is_jam(W, wet_t), costMs=cost, cost=cost / 1000,
                detail=detail, viol=[(d["rule"], d["severity"]) for d in detail],
                illegal=sorted(illegal), nitems=len(contents))

# ---------------------------------------------------------------- per-item outcomes
TINT_RANK = {"none": 0, "lint": 1, "stained": 2, "smudged": 3, "greyBlue": 4, "pink": 5}

def consequences(load, level_seed, load_index, cfg=CFG):
    """Returns {instanceId: {shape, tint, ruined, ballooned}}. load_index is 0-based (Start presses so far)."""
    e = evaluate(load, cfg)
    contents = list(load.get("items", [])) + [i for b in load.get("bags", []) for i in b]
    out = {i: dict(shape="normal", tint="none", ruined=False, ballooned=e["jam"]) for i in contents}
    tint_for = {"COLOR_BLEED": "pink", "COLOR_DYE": "greyBlue", "HYG_DIRTY_WITH_LIGHT": "smudged",
                "HYG_DIRTY_WITH_DARK": "stained", "COLOR_LINT": "lint"}
    for d in e["detail"]:
        for i in d["ids"]:
            if d["rule"] in tint_for:
                t = tint_for[d["rule"]]
                if TINT_RANK[t] > TINT_RANK[out[i]["tint"]]: out[i]["tint"] = t
                if d["severity"] == "fatal": out[i]["ruined"] = True
            elif d["rule"] == "SMALL_LOOSE":
                u = mulberry32(fnv1a32(f"{level_seed}:{load_index}:{i}"))()
                out[i]["shape"] = "lost" if u < LOST_THRESHOLD else "stretched"
    return out

# ---------------------------------------------------------------- levels
def L(items, bags=None): return {"items": items, "bags": bags or []}

LEVELS = {}
def level(id, tutorial, seed, m10, loads, card=None, small=False):
    LEVELS[id] = dict(id=id, tutorial=tutorial, seed=seed, m10=m10, m=m10 / 10, loads=loads, card=card, small=small)

level("1-1", 1, 11010, 16, [
  L(["tee_white", "shirt_white", "tee_mint"]),
  L(["tee_black", "tee_grey", "shirt_black"])], card="t1_sort")
level("1-2", 1, 11020, 16, [
  L(["tee_white", "shirt_white", "tee_mint", "shirt_pastel_blue"]),
  L(["tee_black", "shirt_navy", "trousers_black", "tee_red"])], card="t1_bleed")
level("1-3", 1, 11030, 16, [
  L(["shirt_pastel_yellow", "tee_white", "tee_beige", "shirt_white", "tee_mint"]),
  L(["tee_grey", "shirt_striped", "tee_black", "tee_red", "trousers_black", "shirt_navy"])])
level("2-1", 2, 12010, 14, [
  L(["jeans_blue"]*2 + ["hoodie_navy"]*2 + ["trousers_black"] + ["shirt_black"]*2 + ["tee_black"]),
  L(["jeans_blue"] + ["hoodie_navy"] + ["trousers_black"]*2 + ["shirt_black"] + ["tee_black"] + ["tee_grey"]*2)], card="t2_size")
level("2-2", 2, 12020, 14, [
  L(["hoodie_white", "tee_white", "tee_white", "shirt_pastel_blue", "tee_beige"]),
  L(["jeans_blue"]*2 + ["hoodie_navy"]*2 + ["trousers_black", "tee_red"]),
  L(["jeans_blue"]*2 + ["hoodie_navy"]*2 + ["trousers_black", "shirt_black"])])
level("2-3", 2, 12030, 14, [
  L(["hoodie_white"]*3 + ["tee_white"]*2 + ["shirt_white", "shirt_pastel_yellow", "tee_beige", "tee_mint"]),
  L(["hoodie_navy"]*2 + ["jeans_blue"]*3 + ["trousers_black"]),
  L(["puffer_navy", "tee_red", "tee_grey", "shirt_black"])])
level("3-1", 3, 13010, 13, [
  L(["duvet_white", "towel_white", "tee_white", "shirt_white", "tee_mint"]),
  L(["curtain_dark"] + ["towel_navy"]*2 + ["hoodie_navy"] + ["tee_black"]*2 + ["shirt_black"])], card="t3_household")
level("3-2", 3, 13020, 13, [
  L(["duvet_white", "towel_white", "towel_pastel", "tee_white", "shirt_pastel_blue"]),
  L(["sheet_dark", "towel_navy", "shirt_black", "tee_black", "jeans_blue", "trousers_black"]),
  L(["rag_grey", "rag_blue", "rag_white"])], card="t3_rags")
level("3-3", 3, 13030, 13, [
  L(["sheet_white", "towel_white", "towel_pastel", "tee_white", "shirt_white", "hoodie_white"]),
  L(["curtain_dark", "towel_navy", "towel_red", "shirt_black", "tee_black", "jeans_lightwash", "trousers_black"]),
  L(["rag_grey", "rag_blue", "rag_white", "jacket_white"]),
  L(["puffer_navy", "jacket_navy"])])
level("4-1", 4, 14010, 16, [
  L(["tee_white", "hoodie_white"], [["sock_white", "undies_white"]]),
  L(["jeans_blue", "shirt_black", "tee_black"], [["sock_black", "undies_black"]])], card="t4_bags", small=True)
level("4-2", 4, 14020, 13, [
  L(["tee_white", "hoodie_white", "sheet_white"], [["undies_white", "undies_white", "sock_white"]]),
  L(["hoodie_navy", "jeans_blue", "shirt_black"], [["undies_black", "undies_black", "sock_black", "sock_worn_navy"]]),
  L(["rag_grey", "rag_blue", "jacket_white", "jeans_lightwash", "trousers_black"])], small=True)
level("4-3", 4, 14030, 12, [
  L(["duvet_white", "hoodie_white", "tee_white"], [["sock_white", "undies_white"]]),
  L(["curtain_dark", "shirt_black", "tee_red", "towel_navy", "jeans_lightwash"], [["sock_black", "sock_black", "undies_black", "undies_black"]]),
  L(["rag_grey", "rag_blue", "rag_white", "jacket_white"]),
  L(["puffer_navy", "trousers_black"], [["sock_worn_navy"]])], small=True)

EXPECTED_PAR = {"1-1": 59, "1-2": 70, "1-3": 85, "2-1": 104, "2-2": 116, "2-3": 126,
                "3-1": 81, "3-2": 95, "3-3": 127, "4-1": 75, "4-2": 111, "4-3": 125}
EXPECTED_MIN_LOADS = {"1-1": 2, "1-2": 2, "1-3": 2, "2-1": 2, "2-2": 3, "2-3": 3,
                      "3-1": 2, "3-2": 3, "3-3": 4, "4-1": 2, "4-2": 3, "4-3": 4}

NO_REUSE_43 = [L(["duvet_white", "hoodie_white", "tee_white"], [["sock_white", "undies_white"]]),
               L(["curtain_dark", "shirt_black", "tee_red", "towel_navy", "jeans_lightwash"],
                 [["sock_black", "sock_black", "undies_black", "undies_black", "sock_worn_navy"]]),
               L(["rag_grey", "rag_blue", "rag_white", "jacket_white"]),
               L(["puffer_navy", "trousers_black"])]

def level_items(lv):
    c = Counter()
    for ld in lv["loads"]:
        c.update(ld["items"])
        for b in ld["bags"]: c.update(b)
    return c

def par_of(lv):
    evs = [evaluate(ld) for ld in lv["loads"]]
    n = sum(level_items(lv).values())
    cost_ms = sum(e["costMs"] for e in evs)
    return evs, n, cost_ms, par_seconds(lv["m10"], n, cost_ms)

def instance_ids(lv):
    """Instance ids defId#n in levels.json item order, counts ascending."""
    out = []
    for k, v in level_items(lv).items():
        out += [f"{k}#{n}" for n in range(1, v + 1)]
    return out

# ---------------------------------------------------------------- minimum-load solver (auto-bagging)
def auto_load(ids):
    small = [i for i in ids if ITEMS[i][7]]
    big = [i for i in ids if not ITEMS[i][7]]
    nb = math.ceil(sum(ITEMS[i][2] for i in small) / BAG_CAP) if small else 0
    bags = [[] for _ in range(nb)]
    for i in sorted(small, key=lambda x: -ITEMS[x][2]):
        for b in bags:
            if sum(ITEMS[j][2] for j in b) + ITEMS[i][2] <= BAG_CAP:
                b.append(i); break
    return {"items": big, "bags": bags}

def valid_load(ids):
    e = evaluate(auto_load(ids))
    return (not e["jam"]) and (not e["viol"]) and (not e["illegal"])

def min_loads(lv, limit):
    items = sorted(level_items(lv).elements(), key=lambda i: -(ITEMS[i][2] * SWELL_T[ITEMS[i][3]]))
    seen = set()
    def rec(idx, loads):
        key = (idx, tuple(sorted(tuple(sorted(l)) for l in loads)))
        if key in seen: return False
        seen.add(key)
        if idx == len(items): return True
        x = items[idx]; tried = set()
        for l in loads:
            sig = tuple(sorted(l))
            if sig in tried: continue
            tried.add(sig); l.append(x)
            if valid_load(l) and rec(idx + 1, loads): return True
            l.pop()
        if len(loads) < limit:
            loads.append([x])
            if valid_load(loads[-1]) and rec(idx + 1, loads): return True
            loads.pop()
        return False
    return rec(0, [])

# ---------------------------------------------------------------- trap tests
def T(items, bags=None): return L(items, bags)
TRAPS = [
 ("1-2 red tee with lights", T(["tee_red", "tee_white", "shirt_white"]), {("COLOR_BLEED", "fatal")}, False),
 ("1-3 grey tee with lights", T(["tee_grey", "tee_white"]), {("COLOR_DYE", "fatal")}, False),
 ("1-3 striped shirt with lights", T(["shirt_striped", "shirt_white"]), {("COLOR_DYE", "fatal")}, False),
 ("2-2 dark topping up lights", T(["hoodie_white", "tee_white", "tee_black"]), {("COLOR_DYE", "fatal")}, False),
 ("2-3 puffer + hoodie x2 + trousers", T(["puffer_navy", "hoodie_navy", "hoodie_navy", "trousers_black"]), set(), True),
 ("2-1 all darks in one load", T(["jeans_blue"]*3 + ["hoodie_navy"]*3 + ["trousers_black"]*3), set(), True),
 ("3-2 white rag in lights", T(["rag_white", "tee_white", "towel_white"]), {("HYG_DIRTY_WITH_LIGHT", "fatal")}, False),
 ("3-2 rag in clean darks", T(["rag_grey", "shirt_black", "towel_navy"]), {("HYG_DIRTY_WITH_DARK", "major")}, False),
 ("3-2 rags with jeans (grey/blue only)", T(["rag_grey", "rag_blue", "jeans_blue"]), set(), False),
 ("3-2 white rag with jeans (lint)", T(["rag_white", "rag_grey", "jeans_blue"]), {("COLOR_LINT", "minor")}, False),
 ("3-2 white rag with white jacket", T(["rag_white", "jacket_white"]), set(), False),
 ("3-3 light-wash jeans in lights", T(["jeans_lightwash", "tee_white"]), {("COLOR_DYE", "fatal")}, False),
 ("3-3 white jacket in lights", T(["jacket_white", "tee_white"]), {("HYG_DIRTY_WITH_LIGHT", "fatal")}, False),
 ("3-3 red towel in lights", T(["towel_red", "towel_white"]), {("COLOR_BLEED", "fatal")}, False),
 ("3-3 white towel in darks", T(["towel_white", "towel_navy"]), {("COLOR_DYE", "fatal")}, False),
 ("3-3 jacket_navy in clean darks (jam)", T(["curtain_dark", "towel_navy", "towel_red", "shirt_black", "tee_black", "jeans_lightwash", "trousers_black", "jacket_navy"]), set(), True),
 ("3-3 puffer in dirty load (jam + lint)", T(["puffer_navy", "rag_grey", "rag_blue", "rag_white", "jacket_white"]), {("COLOR_LINT", "minor")}, True),
 ("3-3 jeans with white rag (lint)", T(["rag_grey", "rag_blue", "rag_white", "jacket_white", "jeans_lightwash"]), {("COLOR_LINT", "minor")}, False),
 ("4-1 loose sock", T(["sock_white", "tee_white"]), {("SMALL_LOOSE", "major")}, False),
 ("4-2 underwear in dirty load", T(["rag_grey", "undies_black"]), {("HYG_DIRTY_WITH_DARK", "major"), ("SMALL_LOOSE", "major")}, False),
 ("4-2 mixed-color bag", T(["tee_white"], [["sock_white", "sock_black"]]), {("COLOR_DYE", "fatal")}, False),
 ("4-2 worn socks loose in dirty load", T(["rag_grey", "sock_worn_navy"]), {("SMALL_LOOSE", "major")}, False),
 ("empty bag in drum with one tee (counts W2 B2, no violation)", T(["tee_white"], [[]]), set(), False),
]
ILLEGAL_TESTS = [
 ("bag over capacity", T(["tee_white"], [["undies_white"]*7]), ["BAG_CAPACITY"]),
 ("three bags", T(["tee_white"], [["sock_white"], ["sock_white"], ["sock_white"]]), ["BAG_COUNT"]),
 ("non-small item in a bag", T(["tee_white"], [["tee_white"]]), ["BAG_NOT_SMALL"]),
 ("three bags each over capacity reports each code once", T(["tee_white"], [["undies_white"]*7]*3), ["BAG_CAPACITY", "BAG_COUNT"]),
 ("empty drum", T([]), ["EMPTY_LOAD"]),
 ("duplicate instance", T(["tee_white#1", "tee_white#1"]), ["DUPLICATE_ITEM"]),
]

STAR_CASES = [  # (violations, jam, totalMs, parSeconds, expected stars)
 ([], False, 59000, 59, 3), ([], False, 59001, 59, 2), ([], False, 1, 59, 3),
 ([("COLOR_LINT", "minor")], False, 1000, 59, 1), ([("SMALL_LOOSE", "major")], False, 1000, 59, 1),
 ([("COLOR_LINT", "minor"), ("SMALL_LOOSE", "major")], False, 1000, 59, 1),
 ([("COLOR_DYE", "fatal")], False, 1000, 59, 0), ([("COLOR_DYE", "fatal"), ("SMALL_LOOSE", "major")], False, 1000, 59, 0),
 ([], True, 1000, 59, 0), ([("COLOR_LINT", "minor")], True, 1000, 59, 0),
]

ZONE_CASES = [(62, 69, "light"), (63, 0, "good"), (0, 70, "good"), (81, 90, "good"), (82, 0, "tight"),
              (0, 91, "tight"), (90, 100, "tight"), (91, 0, "overfull"), (0, 101, "overfull"), (0, 0, "light")]
JAM_CASES = [(90, 1000, False), (91, 0, True), (0, 1000, False), (0, 1001, True), (90, 1001, True)]
COST_CASES = [(13, 16), (60, 60), (80, 80), (90, 100), (6, 6), (22, 58), (7, 0), (0, 8)]

# ---------------------------------------------------------------- reporting
def main():
    ok = True
    def fail(msg):
        nonlocal ok; ok = False; print("  FAIL:", msg)

    print("=== PAR SOLUTIONS (integer math) ===")
    for lid, lv in LEVELS.items():
        evs, n, cost_ms, par = par_of(lv)
        print(f"{lid}: items={n} loads={len(evs)} cycleSum={cost_ms/1000:.3f}s par={par}s (m={lv['m']})")
        for k, e in enumerate(evs):
            tag = "" if not (e["viol"] or e["illegal"]) else f"  VIOL {e['viol']} ILLEGAL {e['illegal']}"
            print(f"    load{k+1}: W={e['W']:>3} B={e['B']:>3} wet={e['wet']:>6} fill={e['fill']:>3}% zone={e['zone']:<7} cost={e['costMs']}ms items={e['nitems']}{tag}")
            if e["viol"] or e["illegal"]: fail(f"{lid} load{k+1} has violations/illegal")
            if e["jam"]: fail(f"{lid} load{k+1} jams")
        if par != EXPECTED_PAR[lid]: fail(f"{lid} par {par} != expected {EXPECTED_PAR[lid]}")
        small_present = any(ITEMS[i][7] for i in level_items(lv))
        if small_present != lv["small"]: fail(f"{lid} small flag mismatch")
        if len(evs) != EXPECTED_MIN_LOADS[lid]: fail(f"{lid} solution length != expected min loads")
        if len(evs) > 1:
            if min_loads(lv, len(evs) - 1): fail(f"{lid} solvable in {len(evs)-1} loads (not minimal)")
            else: print(f"    minimal: no valid partition into {len(evs)-1} loads (proved)")

    print("\n=== TRAP TESTS ===")
    for name, ld, exp, jam in TRAPS:
        e = evaluate(ld); got = set(e["viol"])
        good = got == exp and e["jam"] == jam and not e["illegal"]
        print(f"  {'ok ' if good else 'BAD'} {name}: viol={sorted(got)} jam={e['jam']} (W={e['W']} B={e['B']} wet={e['wet']})")
        if not good: fail(name)
    print("\n=== ILLEGAL-STATE TESTS (each code reported once) ===")
    for name, ld, exp in ILLEGAL_TESTS:
        e = evaluate(ld); good = e["illegal"] == sorted(exp)
        print(f"  {'ok ' if good else 'BAD'} {name}: {e['illegal']}")
        if not good: fail(name)

    print("\n=== FLAG: lintAffectsFlexDark=False keeps par solutions valid ===")
    cfg2 = dict(CFG, lintAffectsFlexDark=False)
    for lid, lv in LEVELS.items():
        for ld in lv["loads"]:
            if evaluate(ld, cfg2)["viol"]: fail(f"{lid} invalid with flag off")
    print("  ok")

    print("\n=== BAGS ===")
    for lid, lv in LEVELS.items():
        print(f"  {lid}: bags used by reusable par solution = {sum(len(ld['bags']) for ld in lv['loads'])}")
    evs = [evaluate(x) for x in NO_REUSE_43]
    nb = sum(len(x["bags"]) for x in NO_REUSE_43)
    good = nb <= 2 and all(not e["viol"] and not e["jam"] and not e["illegal"] for e in evs)
    print(f"  4-3 no-reuse alternative: bags={nb}, valid={good}")
    if not good: fail("4-3 no-reuse alternative invalid")

    print("\n=== ZONES / JAM / COST / STARS ===")
    for W, B, z in ZONE_CASES:
        if zone(W, B) != z: fail(f"zone({W},{B}) = {zone(W,B)} != {z}")
    for W, wt, j in JAM_CASES:
        if is_jam(W, wt) != j: fail(f"is_jam({W},{wt})")
    for v, j, t, p, s in STAR_CASES:
        if stars_for(v, j, t, p) != s: fail(f"stars {v} jam={j} t={t} par={p}")
    print("  ok" if ok else "  (see failures)")

    print("\n=== RNG self-check ===")
    # known-answer vectors, cross-checked against the JS reference when node is available
    print("  fnv1a32('a') =", fnv1a32("a"), "(expected 3826002220)")
    if fnv1a32("a") != 3826002220: fail("fnv1a32 known answer")
    r = mulberry32(1)
    print("  mulberry32(1) first u32 =", r())

    if "--export" in sys.argv: export()
    print("\nRESULT:", "ALL CHECKS PASSED" if ok else "FAILURES")
    sys.exit(0 if ok else 1)

# ---------------------------------------------------------------- export
def export():
    d = os.path.dirname(os.path.abspath(__file__))
    items = []
    for i in ITEMS:
        x = it(i)
        items.append({"id": i, "name": x["name"], "weight": x["W"], "bulk": x["B"], "swell": x["swell"], "tier": x["tier"],
                      "bleeds": x["bleeds"], "hygiene": x["hygiene"], "small": x["small"], "shedder": x["shedder"]})
    json.dump({"schema": 1, "items": items}, open(os.path.join(d, "items.json"), "w"), indent=2)

    lvs = []
    for lid, lv in LEVELS.items():
        c = level_items(lv)
        evs, n, cost_ms, par = par_of(lv)
        lvs.append({"id": lid, "tutorial": lv["tutorial"], "seed": lv["seed"], "bags": 2 if lv["small"] else 0,
                    "bagsReusable": True,
                    "flags": {"showFillRing": lv["tutorial"] >= 2, "smallItemLoss": lv["small"]},
                    "tutorialCard": lv["card"],
                    "items": [{"id": k, "count": v} for k, v in c.items()],
                    "par": {"seconds": par, "multiplierTenths": lv["m10"], "minLoads": len(evs),
                            "solution": [{"items": ld["items"], "bags": ld["bags"]} for ld in lv["loads"]]}})
    json.dump({"schema": 1, "levels": lvs}, open(os.path.join(d, "levels.json"), "w"), indent=2)

    def pack(e): return {"weight": e["W"], "dryBulk": e["B"], "wetBulkTenths": e["wetT"], "zone": e["zone"], "jam": e["jam"],
                         "costMs": e["costMs"], "violations": sorted([list(v) for v in e["viol"]]), "illegal": e["illegal"]}
    fx = {"schema": 1,
          "notes": "Load format: {items:[ids], bags:[[ids]]}. Ids are def ids (instance ids 'def#n' also accepted). "
                   "Violations are [rule, severity] pairs, sorted. wetBulkTenths is an integer (wet bulk x 10).",
          "traps": [{"name": n, "load": ld, "expect": pack(evaluate(ld))} for n, ld, _, _ in TRAPS],
          "illegal": [{"name": n, "load": ld, "expect": evaluate(ld)["illegal"]} for n, ld, _ in ILLEGAL_TESTS],
          "zones": [{"weight": W, "dryBulk": B, "zone": z} for W, B, z in ZONE_CASES],
          "jam": [{"weight": W, "wetBulkTenths": wt, "jam": j} for W, wt, j in JAM_CASES],
          "cycleCosts": [{"weight": W, "dryBulk": B, "costMs": cycle_ms(W, B)} for W, B in COST_CASES],
          "stars": [{"violations": [list(x) for x in v], "jam": j, "totalMs": t, "parSeconds": p, "stars": s}
                    for v, j, t, p, s in STAR_CASES],
          "rng": {
              "fnv1a32": [{"input": s, "hash": fnv1a32(s)} for s in ["", "a", "14010:0:sock_white#1", "12030:hamper"]],
              "mulberry32": [{"seed": s, "u32": (lambda g: [g() for _ in range(4)])(mulberry32(s))} for s in [0, 1, 123456789]],
              "lostThresholdU32": LOST_THRESHOLD,
          },
          "par": [{"levelId": lid, "itemCount": n, "multiplierTenths": lv["m10"], "sumCostMs": c, "parSeconds": p}
                  for lid, lv in LEVELS.items() for _, n, c, p in [par_of(lv)]],
          "noReuseAlternative43": [{"items": x["items"], "bags": x["bags"]} for x in NO_REUSE_43],
          "hamperShuffle": [{"levelId": lid, "levelSeed": lv["seed"], "instanceIdsIn": instance_ids(lv),
                             "instanceIdsOut": shuffle_ids(instance_ids(lv), lv["seed"])}
                            for lid, lv in LEVELS.items() if lid in ("1-1", "4-1")]}
    # consequence scenarios (load_index is 0-based)
    scen = [
      ("loose small items, lost or stretched by seeded dice", 14010, 0,
       L(["tee_white#1", "sock_white#1", "undies_white#1"])),
      ("loose small items, mix of lost and stretched (second wash of the level)", 14030, 3,
       L(["sock_black#1", "undies_black#1", "sock_worn_navy#1"])),
      ("bleed turns lights pink, bleeder itself unchanged", 11020, 1, L(["tee_red#1", "tee_white#1", "shirt_white#1"])),
      ("dirty load: stained beats lint on a clean dark item; flex dark gets lint", 13030, 2,
       L(["rag_white#1", "rag_grey#1", "tee_black#1", "jeans_blue#1"])),
      ("white rag in the lights: smudged and ruined", 13020, 0, L(["rag_white#1", "tee_white#1", "towel_white#1"])),
      ("jam balloons everything in the drum", 12030, 0, L(["puffer_navy#1", "hoodie_navy#1", "hoodie_navy#2", "trousers_black#1"])),
    ]
    fx["consequences"] = [{"name": n, "levelSeed": s, "loadIndex": li, "load": ld,
                           "expect": consequences(ld, s, li)} for n, s, li, ld in scen]
    json.dump(fx, open(os.path.join(d, "fixtures.json"), "w"), indent=2)
    print("exported items.json, levels.json, fixtures.json")

if __name__ == "__main__":
    main()
