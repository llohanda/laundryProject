#!/usr/bin/env python3
"""Reference model + verifier for the Fresh Laundry GDD.
Single source of truth for item catalog, level contents, par solutions.
Run:  python3 verify_gdd.py            (prints report, exits 1 on any failure)
      python3 verify_gdd.py --export   (also writes items.json / levels.json next to this file)
"""
import json, math, sys, itertools
from collections import Counter

SWELL = {"low": 1.0, "medium": 1.2, "high": 2.0}
DRUM_W, DRUM_B = 90, 100
BAG_W, BAG_B, BAG_CAP = 2, 2, 12
MAX_BAGS_PER_LOAD = 2

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

def it(i):
    n, w, b, s, t, bl, h, sm, sh = ITEMS[i]
    return dict(id=i, name=n, W=w, B=b, swell=s, tier=t, bleeds=bl, hygiene=h, small=sm, shedder=sh)

CFG = dict(lintAffectsFlexDark=True, smallItemLoss=True)

def evaluate(load, cfg=CFG):
    """load = {"items":[ids loose], "bags":[[ids],[ids]]}  -> dict"""
    loose = [it(i) for i in load.get("items", [])]
    bags = [[it(i) for i in b] for b in load.get("bags", [])]
    viol = []
    for b in bags:
        if len(bags) > MAX_BAGS_PER_LOAD: viol.append(("BAG_COUNT", "illegal"))
        if any(not x["small"] for x in b): viol.append(("BAG_NOT_SMALL", "illegal"))
        if sum(x["B"] for x in b) > BAG_CAP: viol.append(("BAG_CAPACITY", "illegal"))
    contents = loose + [x for b in bags for x in b]
    W = sum(x["W"] for x in contents) + BAG_W * len(bags)
    B = sum(x["B"] for x in contents) + BAG_B * len(bags)
    wet = sum(x["B"] * SWELL[x["swell"]] for x in contents) + BAG_B * len(bags)
    dirty_load = any(x["hygiene"] == "dirty" for x in contents)
    if not dirty_load:
        light = [x for x in contents if x["tier"] == "light"]
        dark = [x for x in contents if x["tier"] == "dark"]
        if light and any(x["bleeds"] for x in dark): viol.append(("COLOR_BLEED", "fatal"))
        elif light and dark: viol.append(("COLOR_DYE", "fatal"))
    else:
        for x in contents:
            if x["hygiene"] == "clean":
                viol.append(("HYG_DIRTY_WITH_LIGHT", "fatal") if x["tier"] == "light" else ("HYG_DIRTY_WITH_DARK", "major"))
        if any(x["shedder"] and x["hygiene"] == "dirty" for x in contents):
            for x in contents:
                if x["tier"] == "dark" and x["hygiene"] != "dirty":
                    if x["hygiene"] == "flex" and not cfg["lintAffectsFlexDark"]: continue
                    viol.append(("COLOR_LINT", "minor"))
    if cfg["smallItemLoss"]:
        for x in loose:
            if x["small"]: viol.append(("SMALL_LOOSE", "major"))
    jam = W > DRUM_W or wet > DRUM_B
    fill = max(W / DRUM_W, B / DRUM_B)
    cost = 6 + max(W, B) / 15
    return dict(W=W, B=B, wet=round(wet, 1), fill=round(fill * 100), jam=jam, cost=cost, viol=viol, nitems=len(loose) + sum(len(b) for b in bags))

# ---------------------------------------------------------------- levels
def L(items, bags=None): return {"items": items, "bags": bags or []}

LEVELS = {}
def level(id, tutorial, seed, m, loads, card=None, small=False):
    LEVELS[id] = dict(id=id, tutorial=tutorial, seed=seed, m=m, loads=loads, card=card, small=small)

level("1-1", 1, 11010, 1.6, [
  L(["tee_white", "shirt_white", "tee_mint"]),
  L(["tee_black", "tee_grey", "shirt_black"])], card="t1_sort")
level("1-2", 1, 11020, 1.6, [
  L(["tee_white", "shirt_white", "tee_mint", "shirt_pastel_blue"]),
  L(["tee_black", "shirt_navy", "trousers_black", "tee_red"])], card="t1_bleed")
level("1-3", 1, 11030, 1.6, [
  L(["shirt_pastel_yellow", "tee_white", "tee_beige", "shirt_white", "tee_mint"]),
  L(["tee_grey", "shirt_striped", "tee_black", "tee_red", "trousers_black", "shirt_navy"])])
level("2-1", 2, 12010, 1.4, [
  L(["jeans_blue"]*2 + ["hoodie_navy"]*2 + ["trousers_black"] + ["shirt_black"]*2 + ["tee_black"]),
  L(["jeans_blue"] + ["hoodie_navy"] + ["trousers_black"]*2 + ["shirt_black"] + ["tee_black"] + ["tee_grey"]*2)], card="t2_size")
level("2-2", 2, 12020, 1.4, [
  L(["hoodie_white", "tee_white", "tee_white", "shirt_pastel_blue", "tee_beige"]),
  L(["jeans_blue"]*2 + ["hoodie_navy"]*2 + ["trousers_black", "tee_red"]),
  L(["jeans_blue"]*2 + ["hoodie_navy"]*2 + ["trousers_black", "shirt_black"])])
level("2-3", 2, 12030, 1.4, [
  L(["hoodie_white"]*3 + ["tee_white"]*2 + ["shirt_white", "shirt_pastel_yellow", "tee_beige", "tee_mint"]),
  L(["hoodie_navy"]*2 + ["jeans_blue"]*3 + ["trousers_black"]),
  L(["puffer_navy", "tee_red", "tee_grey", "shirt_black"])])
level("3-1", 3, 13010, 1.3, [
  L(["duvet_white", "towel_white", "tee_white", "shirt_white", "tee_mint"]),
  L(["curtain_dark"] + ["towel_navy"]*2 + ["hoodie_navy"] + ["tee_black"]*2 + ["shirt_black"])], card="t3_household")
level("3-2", 3, 13020, 1.3, [
  L(["duvet_white", "towel_white", "towel_pastel", "tee_white", "shirt_pastel_blue"]),
  L(["sheet_dark", "towel_navy", "shirt_black", "tee_black", "jeans_blue", "trousers_black"]),
  L(["rag_grey", "rag_blue", "rag_white"])], card="t3_rags")
level("3-3", 3, 13030, 1.3, [
  L(["sheet_white", "towel_white", "towel_pastel", "tee_white", "shirt_white", "hoodie_white"]),
  L(["curtain_dark", "towel_navy", "towel_red", "shirt_black", "tee_black", "jeans_lightwash", "trousers_black"]),
  L(["rag_grey", "rag_blue", "rag_white", "jacket_white"]),
  L(["puffer_navy", "jacket_navy"])])
level("4-1", 4, 14010, 1.6, [
  L(["tee_white", "hoodie_white"], [["sock_white", "undies_white"]]),
  L(["jeans_blue", "shirt_black", "tee_black"], [["sock_black", "undies_black"]])], card="t4_bags", small=True)
level("4-2", 4, 14020, 1.3, [
  L(["tee_white", "hoodie_white", "sheet_white"], [["undies_white", "undies_white", "sock_white"]]),
  L(["hoodie_navy", "jeans_blue", "shirt_black"], [["undies_black", "undies_black", "sock_black", "sock_worn_navy"]]),
  L(["rag_grey", "rag_blue", "jacket_white", "jeans_lightwash", "trousers_black"])], small=True)
level("4-3", 4, 14030, 1.2, [
  L(["duvet_white", "hoodie_white", "tee_white"], [["sock_white", "undies_white"]]),
  L(["curtain_dark", "shirt_black", "tee_red", "towel_navy", "jeans_lightwash"], [["sock_black", "sock_black", "undies_black", "undies_black"]]),
  L(["rag_grey", "rag_blue", "rag_white", "jacket_white"]),
  L(["puffer_navy", "trousers_black"], [["sock_worn_navy"]])], small=True)

def level_items(lv):
    c = Counter()
    for ld in lv["loads"]:
        c.update(ld["items"])
        for b in ld["bags"]: c.update(b)
    return c

def par_of(lv):
    evs = [evaluate(ld) for ld in lv["loads"]]
    n = sum(level_items(lv).values())
    cyc = sum(e["cost"] for e in evs)
    return evs, n, cyc, cyc + lv["m"] * (3 * n + 10)

# ---------------------------------------------------------------- minimum-load solver (auto-bagging)
def auto_load(ids):
    """put every small item into bags (min number of bags, but bags must keep tier/hygiene rules -> evaluate sees them)"""
    small = [i for i in ids if ITEMS[i][7]]
    big = [i for i in ids if not ITEMS[i][7]]
    bulk = sum(ITEMS[i][2] for i in small)
    nb = math.ceil(bulk / BAG_CAP) if small else 0
    bags = [[] for _ in range(nb)]
    for i in sorted(small, key=lambda x: -ITEMS[x][2]):
        for b in bags:
            if sum(ITEMS[j][2] for j in b) + ITEMS[i][2] <= BAG_CAP:
                b.append(i); break
    return {"items": big, "bags": bags}

def valid_load(ids):
    e = evaluate(auto_load(ids))
    return (not e["jam"]) and all(v[1] == "minor" and False for v in e["viol"]) if e["viol"] else not e["jam"]

def min_loads(lv, limit):
    items = sorted(level_items(lv).elements(), key=lambda i: -(ITEMS[i][2] * SWELL[ITEMS[i][3]]))
    seen = set()
    def rec(idx, loads):
        key = (idx, tuple(sorted(tuple(sorted(l)) for l in loads)))
        if key in seen: return False
        seen.add(key)
        if idx == len(items): return True
        x = items[idx]
        tried = set()
        for l in loads:
            sig = tuple(sorted(l))
            if sig in tried: continue
            tried.add(sig)
            l.append(x)
            if valid_load(l) and rec(idx + 1, loads): return True
            l.pop()
        if len(loads) < limit:
            loads.append([x])
            if valid_load(loads[-1]) and rec(idx + 1, loads): return True
            loads.pop()
        return False
    return rec(0, [])

# ---------------------------------------------------------------- trap tests: (level or None, load, expected set of (rule,sev), expect_jam)
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
 ("bag over capacity", T(["tee_white"], [["undies_white"]*7]), {("BAG_CAPACITY", "illegal")}, False),
]

def main():
    ok = True
    def fail(msg):
        nonlocal ok; ok = False; print("  FAIL:", msg)
    print("=== PAR SOLUTIONS ===")
    report = {}
    for lid, lv in LEVELS.items():
        evs, n, cyc, par = par_of(lv)
        print(f"{lid}: items={n} loads={len(evs)} cycleSum={cyc:.1f} par={par:.1f}s -> {round(par)}s (m={lv['m']})")
        for k, e in enumerate(evs):
            tag = "" if not e["viol"] else f"  VIOL {e['viol']}"
            print(f"    load{k+1}: W={e['W']:>3} B={e['B']:>3} wet={e['wet']:>6} fill={e['fill']:>3}% cost={e['cost']:.1f} items={e['nitems']}{tag}")
            if e["viol"]: fail(f"{lid} load{k+1} has violations")
            if e["jam"]: fail(f"{lid} load{k+1} jams")
        small_present = any(ITEMS[i][7] for i in level_items(lv))
        if small_present != lv["small"]: fail(f"{lid} small flag mismatch")
        # minimum load count proof
        if len(evs) > 1:
            if min_loads(lv, len(evs) - 1): fail(f"{lid} can be solved in {len(evs)-1} loads (par not minimal)")
            else: print(f"    minimal: no valid partition into {len(evs)-1} loads (proved)")
        report[lid] = dict(n=n, loads=len(evs), cyc=round(cyc, 2), par=round(par))
    print("\n=== TRAP / RULE TESTS ===")
    for name, ld, exp, jam in TRAPS:
        e = evaluate(ld)
        got = set(e["viol"])
        good = (got == exp) and (e["jam"] == jam)
        print(f"  {'ok ' if good else 'BAD'} {name}: viol={sorted(got)} jam={e['jam']} (W={e['W']} B={e['B']} wet={e['wet']})")
        if not good: fail(name)
    print("\n=== FLAG CHECK: lintAffectsFlexDark=False keeps par solutions valid ===")
    cfg2 = dict(CFG, lintAffectsFlexDark=False)
    for lid, lv in LEVELS.items():
        for ld in lv["loads"]:
            if evaluate(ld, cfg2)["viol"]: fail(f"{lid} invalid with flag off")
    print("  ok" if ok else "  (see failures)")
    print("\n=== NON-REUSABLE BAGS (2 per level) ===")
    for lid, lv in LEVELS.items():
        used = sum(len(ld["bags"]) for ld in lv["loads"])
        print(f"  {lid}: bags used by the (reusable) par solution = {used}")
    alt = [L(["duvet_white", "hoodie_white", "tee_white"], [["sock_white", "undies_white"]]),
           L(["curtain_dark", "shirt_black", "tee_red", "towel_navy", "jeans_lightwash"],
             [["sock_black", "sock_black", "undies_black", "undies_black", "sock_worn_navy"]]),
           L(["rag_grey", "rag_blue", "rag_white", "jacket_white"]),
           L(["puffer_navy", "trousers_black"])]
    evs = [evaluate(x) for x in alt]
    bad = [e for e in evs if e["viol"] and any(v[0] != "SMALL_LOOSE" for v in e["viol"]) or e["jam"]]
    nb = sum(len(x["bags"]) for x in alt)
    print(f"  4-3 no-reuse alternative: bags={nb}, loads valid={not bad and not any(e['viol'] for e in evs)}")
    if nb > 2 or bad or any(e["viol"] for e in evs): fail("4-3 no-reuse alternative invalid")
    if "--export" in sys.argv: export()
    print("\nRESULT:", "ALL CHECKS PASSED" if ok else "FAILURES")
    sys.exit(0 if ok else 1)

def export():
    import os
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
        evs, n, cyc, par = par_of(lv)
        lvs.append({"id": lid, "tutorial": lv["tutorial"], "seed": lv["seed"], "bags": 2 if lv["small"] else 0,
                    "bagsReusable": True,
                    "flags": {"showFillRing": lv["tutorial"] >= 2, "smallItemLoss": lv["small"]},
                    "tutorialCard": lv["card"],
                    "items": [{"id": k, "count": v} for k, v in c.items()],
                    "par": {"seconds": round(par), "multiplier": lv["m"], "minLoads": len(evs),
                            "solution": [{"items": ld["items"], "bags": ld["bags"]} for ld in lv["loads"]]}})
    json.dump({"schema": 1, "levels": lvs}, open(os.path.join(d, "levels.json"), "w"), indent=2)
    print("exported items.json, levels.json")

if __name__ == "__main__":
    main()
