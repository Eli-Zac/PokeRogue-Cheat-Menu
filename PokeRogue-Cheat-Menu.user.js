// ==UserScript==
// @name         PokeRogue Cheat Menu
// @namespace    https://github.com/Eli-Zac/PokeRogue-Cheat-Menu
// @version      1.9
// @description  Cheat menu for PokeRogue
// @author       Eli_Zac
// @match        *://pokerogue.net/*
// @match        *://www.pokerogue.net/*
// @match        *://play.pokerogue.net/*
// @match        *://playpokerogue.com/*
// @match        *://www.playpokerogue.com/*
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  const uw = (typeof window !== 'undefined' && window.wrappedJSObject)
    ? window.wrappedJSObject
    : unsafeWindow;

  const TOGGLE_KEY = 'F2';
  let guiVisible = false;
  let activeSection = null;

  function getScriptVersion() {
    return globalThis.GM_info?.script?.version || 'unknown';
  }

  // ─── PHASER ACCESS ───────────────────────────────────────────────────────

  let _game = null;

  function hookPhaserConstructor() {
    if (!uw.Phaser?.Game || uw.Phaser.Game.__prHooked) return;
    const Orig = uw.Phaser.Game;
    uw.Phaser.Game = function (...args) {
      const inst = new Orig(...args);
      _game = inst;
      return inst;
    };
    uw.Phaser.Game.prototype = Orig.prototype;
    uw.Phaser.Game.__prHooked = true;
    Object.keys(Orig).forEach(k => { try { uw.Phaser.Game[k] = Orig[k]; } catch (_) {} });
  }

  function getPhaserGame() {
    if (_game?.scene) return _game;
    let keys = [];
    try { keys = Object.getOwnPropertyNames(uw); } catch (_) {
      try { keys = Object.keys(uw); } catch (_) {}
    }
    for (const k of keys) {
      try {
        const v = uw[k];
        if (v?.scene && Array.isArray(v.scene.scenes) && v.scene.scenes.length > 0 && v.renderer) {
          _game = v; return _game;
        }
      } catch (_) {}
    }
    return null;
  }

  function findGameScene() {
    return getPhaserGame()?.scene?.scenes?.find(sc => sc?.gameData) ?? null;
  }

  function findGachaHandler() {
    const scene = findGameScene();
    if (!scene?.ui) return null;
    for (const k of Object.keys(scene.ui)) {
      try {
        const v = scene.ui[k];
        if (!v) continue;
        if (typeof v.updateVoucherCounts === 'function') return v;
        if (Array.isArray(v)) {
          for (const h of v) {
            if (h && typeof h.updateVoucherCounts === 'function') return h;
          }
        }
      } catch (_) {}
    }
    return null;
  }

  function findGameData() {
    if (uw.globalScene?.gameData) return uw.globalScene.gameData;
    return findGameScene()?.gameData ?? null;
  }

  if (uw.Phaser) hookPhaserConstructor();
  else {
    let attempts = 0;
    const iv = setInterval(() => {
      if (uw.Phaser) { hookPhaserConstructor(); clearInterval(iv); }
      if (++attempts > 100) clearInterval(iv);
    }, 100);
  }

  // ─── VOUCHER HACKS ───────────────────────────────────────────────────────

  function getVoucherCounts() {
    const gd = findGameData();
    if (!gd?.voucherCounts) return null;
    return [0, 1, 2, 3].map(i => gd.voucherCounts[i] ?? 0);
  }

  function setVoucherCounts(values) {
    const gd = findGameData();
    if (!gd?.voucherCounts) return false;
    const vals = Array.isArray(values) ? values : [values, values, values, values];
    for (let i = 0; i < 4; i++) gd.voucherCounts[i] = Math.max(0, Math.floor(vals[i]));
    const handler = findGachaHandler();
    if (handler && typeof handler.updateVoucherCounts === 'function') handler.updateVoucherCounts();
    return true;
  }

  // ─── EGG LIMIT HACK ──────────────────────────────────────────────────────
  // Patches processInput on the gacha handler to temporarily swap a fake
  // eggs array (length=0) onto gameData for the duration of the synchronous
  // cap check only. Restored in finally{} before anything else runs.
  // The egg list screen uses a separate code path and is never affected.

  let _eggLimitRemoved = false;
  let _eggPatchInstalled = false;
  let _origProcessInput = null;
  let _patchedHandler = null;

  function installProcessInputPatch() {
    if (_eggPatchInstalled) return true;
    const handler = findGachaHandler();
    if (!handler || typeof handler.processInput !== 'function') return false;

    _origProcessInput = handler.processInput;
    _patchedHandler = handler;

    handler.processInput = function (button) {
      if (!_eggLimitRemoved) return _origProcessInput.call(this, button);

      const gd = findGameData();
      if (!gd) return _origProcessInput.call(this, button);

      const real = gd.eggs;
      const fake = new Proxy(real, {
        get(t, p) {
          if (p === 'length') return 0;
          const v = t[p];
          return typeof v === 'function' ? v.bind(t) : v;
        },
        set(t, p, v) { t[p] = v; return true; }
      });

      try {
        Object.defineProperty(gd, 'eggs', {
          get: () => fake, set: (v) => { gd._eggsReal = v; },
          configurable: true, enumerable: true,
        });
      } catch (_) { gd.eggs = fake; }

      let result;
      try {
        result = _origProcessInput.call(this, button);
      } finally {
        try {
          Object.defineProperty(gd, 'eggs', {
            value: real, writable: true, configurable: true, enumerable: true,
          });
        } catch (_) { gd.eggs = real; }
      }
      return result;
    };

    _eggPatchInstalled = true;
    return true;
  }

  function setEggLimitRemoved(enabled) {
    if (enabled && !_eggPatchInstalled) {
      if (!installProcessInputPatch()) return false;
    }
    _eggLimitRemoved = enabled;
    return true;
  }

  function getEggCount() {
    const gd = findGameData();
    return gd?.eggs?.length ?? null;
  }

  function getEggTypeFromEntry(egg) {
    if (!egg || typeof egg !== 'object') return null;
    const keys = ['gachaType', 'eggType', 'sourceType', 'type', 'tier'];
    for (const key of keys) {
      const v = egg[key];
      if (Number.isFinite(v)) return v;
    }
    return null;
  }

  const EGG_TYPE_OPTIONS = [
    { value: 0, label: 'Common' },
    { value: 1, label: 'Rare' },
    { value: 2, label: 'Epic' },
    { value: 3, label: 'Legendary' },
    { value: 4, label: 'Manaphy' },
  ];

  function getEggTargetTier(typeId) {
    return typeId === 4 ? 2 : Math.max(0, Math.min(3, Number(typeId) || 0));
  }

  function getEggSourceType(typeId) {
    return typeId === 3 ? 1 : 0;
  }

  function makeManaphyEggId() {
    const now = Math.max(204, Date.now());
    return Math.ceil(now / 204) * 204;
  }

  function snapshotEggState(gd) {
    return {
      eggPity: Array.isArray(gd?.eggPity) ? [...gd.eggPity] : null,
      unlockPity: Array.isArray(gd?.unlockPity) ? [...gd.unlockPity] : null,
      gameStats: gd?.gameStats ? {
        eggsPulled: gd.gameStats.eggsPulled,
        rareEggsPulled: gd.gameStats.rareEggsPulled,
        epicEggsPulled: gd.gameStats.epicEggsPulled,
        legendaryEggsPulled: gd.gameStats.legendaryEggsPulled,
        manaphyEggsPulled: gd.gameStats.manaphyEggsPulled,
      } : null,
    };
  }

  function restoreEggState(gd, snapshot) {
    if (!gd || !snapshot) return;
    if (snapshot.eggPity && Array.isArray(gd.eggPity)) gd.eggPity.splice(0, gd.eggPity.length, ...snapshot.eggPity);
    if (snapshot.unlockPity && Array.isArray(gd.unlockPity)) gd.unlockPity.splice(0, gd.unlockPity.length, ...snapshot.unlockPity);
    if (snapshot.gameStats && gd.gameStats) Object.assign(gd.gameStats, snapshot.gameStats);
  }

  function removeEggsByIds(gd, ids) {
    const eggs = gd?.eggs;
    if (!Array.isArray(eggs) || !ids?.size) return;
    for (let i = eggs.length - 1; i >= 0; i--) {
      if (ids.has(eggs[i]?.id)) eggs.splice(i, 1);
    }
  }

  function getEggConstructor(gd) {
    const existingEgg = gd?.eggs?.find(egg => egg?.constructor && egg.constructor !== Object);
    if (existingEgg?.constructor) return existingEgg.constructor;

    const handler = findGachaHandler();
    if (!handler || typeof handler.pullEggs !== 'function') return null;

    const snapshot = snapshotEggState(gd);
    const originalCursor = handler.gachaCursor;
    const originalGuaranteed = handler.getGuaranteedEggTierFromPullCount;
    let createdEggs = [];

    try {
      handler.gachaCursor = 0;
      if (typeof originalGuaranteed === 'function') handler.getGuaranteedEggTierFromPullCount = () => 1;
      createdEggs = handler.pullEggs(1) || [];
    } catch (_) {
      createdEggs = [];
    } finally {
      try { handler.gachaCursor = originalCursor; } catch (_) {}
      if (typeof originalGuaranteed === 'function') {
        try { handler.getGuaranteedEggTierFromPullCount = originalGuaranteed; } catch (_) {}
      }
    }

    const EggCtor = createdEggs[0]?.constructor && createdEggs[0].constructor !== Object
      ? createdEggs[0].constructor
      : null;

    const createdIds = new Set(createdEggs.map(egg => egg?.id).filter(id => id !== undefined));
    removeEggsByIds(gd, createdIds);
    restoreEggState(gd, snapshot);

    return EggCtor;
  }

  function tryAddEggWithConstructor(gd, typeId) {
    const EggCtor = getEggConstructor(gd);
    if (!EggCtor) return false;

    const options = {
      pulled: true,
      sourceType: getEggSourceType(typeId),
      tier: getEggTargetTier(typeId),
    };

    if (typeId === 4) options.id = makeManaphyEggId();

    const before = gd?.eggs?.length ?? 0;
    try {
      new EggCtor(options);
    } catch (_) {
      try {
        new EggCtor({ scene: findGameScene(), ...options });
      } catch (_) {
        return false;
      }
    }

    return (gd?.eggs?.length ?? 0) > before;
  }

  function cloneEggTemplate(egg) {
    if (typeof structuredClone === 'function') return structuredClone(egg);
    return JSON.parse(JSON.stringify(egg));
  }

  function pushEggClone(gd, typeId) {
    const eggs = gd?.eggs;
    if (!Array.isArray(eggs) || eggs.length === 0) return false;

    const template = eggs.find(e => getEggTypeFromEntry(e) === typeId) ?? eggs[0];
    if (!template) return false;

    const clone = cloneEggTemplate(template);
    ['gachaType', 'eggType', 'sourceType', 'type', 'tier'].forEach(key => {
      if (Object.prototype.hasOwnProperty.call(clone, key)) clone[key] = typeId === 4 ? 2 : typeId;
    });

    if (Object.prototype.hasOwnProperty.call(clone, 'id')) {
      clone.id = typeId === 4 ? makeManaphyEggId() : Date.now() + '-' + Math.random().toString(36).slice(2);
    }

    eggs.push(clone);
    return true;
  }

  function tryAddEggWithGameMethod(gd, typeId) {
    const methodNames = [
      'addEgg',
      'addEggs',
      'createEgg',
      'createEggs',
      'generateEgg',
      'generateEggs',
      'giveEgg',
      'giveEggs',
    ];

    for (const name of methodNames) {
      const fn = gd?.[name];
      if (typeof fn !== 'function') continue;

      const argSets = [
        [typeId],
        [typeId, 1],
        [1, typeId],
        [{ type: typeId }],
        [{ gachaType: typeId }],
      ];

      for (const args of argSets) {
        const before = gd?.eggs?.length ?? 0;
        try {
          fn.apply(gd, args);
        } catch (_) {
          continue;
        }
        const after = gd?.eggs?.length ?? 0;
        if (after > before) return true;
      }
    }

    return false;
  }

  async function deleteAllEggs(onProgress) {
    const gd = findGameData();
    if (!gd || !Array.isArray(gd.eggs)) return { ok: false, deleted: 0, reason: 'connect' };

    const total = gd.eggs.length;
    if (total === 0) {
      await triggerAutosaveAfterEggChange();
      return { ok: true, deleted: 0 };
    }

    if (typeof onProgress === 'function') onProgress(0, total, 0);

    const batchSize = 50;
    let deleted = 0;

    while (gd.eggs.length > 0) {
      const remove = Math.min(batchSize, gd.eggs.length);
      gd.eggs.splice(gd.eggs.length - remove, remove);
      deleted += remove;

      if (typeof onProgress === 'function') {
        onProgress(deleted, total, Math.round((deleted / total) * 100));
      }

      if (gd.eggs.length > 0) await waitTick();
    }

    await triggerAutosaveAfterEggChange();
    return { ok: true, deleted };
  }

  function waitTick() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  async function addEggsByType(typeId, amount, onProgress) {
    const gd = findGameData();
    if (!gd || !Array.isArray(gd.eggs)) return { ok: false, added: 0, reason: 'connect' };

    const target = Math.max(1, Math.floor(Number(amount) || 0));
    let added = 0;
    const batchSize = 10;

    if (typeof onProgress === 'function') onProgress(0, target, 0);

    for (let i = 0; i < target; i++) {
      if (tryAddEggWithConstructor(gd, typeId) || tryAddEggWithGameMethod(gd, typeId) || pushEggClone(gd, typeId)) {
        added++;
      } else {
        break;
      }

      if (typeof onProgress === 'function') {
        const pct = Math.round((added / target) * 100);
        onProgress(added, target, pct);
      }

      if ((i + 1) % batchSize === 0) {
        await waitTick();
      }
    }

    return { ok: added === target, added };
  }

  async function triggerAutosaveAfterEggChange() {
    const scene = findGameScene();
    const gd = findGameData();

    const roots = [
      gd,
      scene,
      scene?.gameData,
      scene?.session,
      scene?.ui,
      uw.globalScene,
    ].filter(Boolean);

    const methodNames = [
      'saveSystem',
      'saveData',
      'saveGameData',
      'queueSave',
      'queueSaveData',
      'queueSystemSave',
      'requestSave',
      'updateSystem',
      'updateSystemData',
      'syncSystemData',
    ];

    const seen = new Set();
    let invoked = false;

    for (const root of roots) {
      for (const name of methodNames) {
        const fn = root?.[name];
        if (typeof fn !== 'function') continue;
        if (seen.has(fn)) continue;
        seen.add(fn);

        const argSets = [
          [],
          [true],
          [{ source: 'cheat-menu', reason: 'manual-eggs' }],
        ];

        for (const args of argSets) {
          try {
            const result = fn.apply(root, args);
            invoked = true;
            if (result && typeof result.then === 'function') {
              await Promise.race([
                result,
                new Promise(resolve => setTimeout(resolve, 350)),
              ]);
            }
            break;
          } catch (_) {}
        }
      }
    }

    return invoked;
  }

  // ─── POKEDEX HACKS ─────────────────────────────────────────────────────────

  // Bitmask covering NON_SHINY(1) | SHINY(2) | MALE(4) | FEMALE(8) |
  // DEFAULT_VARIANT(16) | VARIANT_2(32) | VARIANT_3(64) | DEFAULT_FORM(128)
  // plus generous headroom for extended form bits.
  const FULL_DEX_ATTR = (1n << 12n) - 1n; // 4095n
  // All 25 natures unlocked (bits 0-24)
  const FULL_NATURE_ATTR = (1 << 25) - 1;

  function getDexStats() {
    const gd = findGameData();
    if (!gd?.dexData) return null;
    const keys = Object.keys(gd.dexData);
    let caught = 0;
    for (const k of keys) {
      if (gd.dexData[k]?.caughtAttr) caught++;
    }
    return { total: keys.length, caught };
  }

  async function catchAllPokemon(onProgress) {
    const gd = findGameData();
    if (!gd?.dexData) return { ok: false, updated: 0, reason: 'connect' };

    const keys = Object.keys(gd.dexData);
    const total = keys.length;
    let updated = 0;

    if (typeof onProgress === 'function') onProgress(0, total, 0);

    for (let i = 0; i < keys.length; i++) {
      const entry = gd.dexData[keys[i]];
      if (!entry) continue;

      // Mark as fully caught & seen
      if (typeof entry.caughtAttr === 'bigint' || entry.caughtAttr === undefined) {
        entry.caughtAttr = FULL_DEX_ATTR;
      }
      if (typeof entry.seenAttr === 'bigint' || entry.seenAttr === undefined) {
        entry.seenAttr = FULL_DEX_ATTR;
      }

      // Bump counts
      if (typeof entry.caughtCount === 'number') entry.caughtCount = Math.max(1, entry.caughtCount);
      else entry.caughtCount = 1;
      if (typeof entry.seenCount === 'number') entry.seenCount = Math.max(1, entry.seenCount);
      else entry.seenCount = 1;

      // Unlock all natures
      if (typeof entry.natureAttr === 'number' || entry.natureAttr === undefined) {
        entry.natureAttr = FULL_NATURE_ATTR;
      }

      updated++;

      if (typeof onProgress === 'function' && i % 50 === 0) {
        onProgress(updated, total, Math.round((updated / total) * 100));
        await waitTick();
      }
    }

    // Try to persist via game save methods
    await triggerAutosaveAfterEggChange();

    return { ok: true, updated };
  }

  async function resetCaughtPokemon(onProgress) {
    const gd = findGameData();
    if (!gd?.dexData) return { ok: false, updated: 0, reason: 'connect' };

    const keys = Object.keys(gd.dexData);
    const total = keys.length;
    let updated = 0;

    if (typeof onProgress === 'function') onProgress(0, total, 0);

    for (let i = 0; i < keys.length; i++) {
      const entry = gd.dexData[keys[i]];
      if (!entry) continue;

      if (typeof entry.caughtAttr === 'bigint' || entry.caughtAttr === undefined) {
        entry.caughtAttr = 0n;
      } else {
        entry.caughtAttr = 0;
      }

      if (typeof entry.caughtCount === 'number') entry.caughtCount = 0;
      else entry.caughtCount = 0;

      updated++;

      if (typeof onProgress === 'function' && i % 50 === 0) {
        onProgress(updated, total, Math.round((updated / total) * 100));
        await waitTick();
      }
    }

    await triggerAutosaveAfterEggChange();

    return { ok: true, updated };
  }

  // ─── GAME STATS ──────────────────────────────────────────────────────────

  const STAT_LABELS = {
    playTime:                  'Play Time (seconds)',
    battles:                   'Battles',
    classicSessionsPlayed:     'Classic Sessions Played',
    endlessSessionsPlayed:     'Endless Sessions Played',
    dailyRunSessionsPlayed:    'Daily Run Sessions Played',
    pokemonSeen:               'Pokémon Seen',
    pokemonCaught:             'Pokémon Caught',
    pokemonHatched:            'Pokémon Hatched',
    pokemonFused:              'Pokémon Fused',
    pokemonDefeated:           'Pokémon Defeated',
    shinyCaught:               'Shinies Caught',
    shinyHatched:              'Shinies Hatched',
    trainersDefeated:          'Trainers Defeated',
    ribbonsEarned:             'Ribbons Earned',
    eggsPulled:                'Eggs Pulled',
    rareEggsPulled:            'Rare Eggs Pulled',
    epicEggsPulled:            'Epic Eggs Pulled',
    legendaryEggsPulled:       'Legendary Eggs Pulled',
    manaphyEggsPulled:         'Manaphy Eggs Pulled',
    subLegendaryEggsPulled:    'Sub-Legendary Eggs Pulled',
    gamesBeat:                 'Games Beat',
  };

  function formatStatKey(key) {
    if (STAT_LABELS[key]) return STAT_LABELS[key];
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
  }

  function getGameStats() {
    const gd = findGameData();
    if (!gd?.gameStats) return null;
    const stats = {};
    for (const [k, v] of Object.entries(gd.gameStats)) {
      if (typeof v === 'number') stats[k] = v;
    }
    return Object.keys(stats).length ? stats : null;
  }

  // ─── SAVE DATA ───────────────────────────────────────────────────────────

  // Keys that represent persistent game progress on gameData
  const SAVE_DATA_KEYS = [
    'trainerId', 'secretId', 'gender', 'playTime', 'gameVersion', 'timestamp',
    'dexData', 'starterData', 'eggs', 'eggPity', 'unlockPity',
    'voucherCounts', 'vouchersUnlocked', 'achvUnlocks', 'unlocks',
    'gameStats', 'sessionData',
  ];

  async function exportSaveData(onProgress) {
    const gd = findGameData();
    if (!gd) return { ok: false, reason: 'connect' };

    if (typeof onProgress === 'function') onProgress('Collecting data\u2026', 10);
    await new Promise(r => setTimeout(r, 400));

    const seen = new WeakSet();
    let json;
    try {
      if (typeof onProgress === 'function') onProgress('Serializing\u2026', 35);
      await new Promise(r => setTimeout(r, 350));
      json = JSON.stringify(gd, function (key, value) {
        if (typeof value === 'function') return undefined;
        if (typeof value === 'bigint') return { __type: 'BigInt', __value: value.toString() };
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) return undefined;
          seen.add(value);
        }
        return value;
      }, 2);
    } catch (e) {
      return { ok: false, reason: 'serialize', error: e.message };
    }

    try {
      if (typeof onProgress === 'function') onProgress('Packaging file\u2026', 70);
      await new Promise(r => setTimeout(r, 350));
      const kb = Math.round(json.length / 1024);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ts = new Date().toISOString().replace(/[T:]/g, '-').replace(/\..+/, '');
      a.download = 'pokerogue-save-' + ts + '.json';
      document.body.appendChild(a);
      if (typeof onProgress === 'function') onProgress('Downloading\u2026', 90);
      await new Promise(r => setTimeout(r, 300));
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      if (typeof onProgress === 'function') onProgress('Done!', 100);
      return { ok: true, kb };
    } catch (e) {
      return { ok: false, reason: 'download', error: e.message };
    }
  }

  async function importSaveData(jsonText, onProgress) {
    const gd = findGameData();
    if (!gd) return { ok: false, reason: 'connect' };

    let data;
    try {
      data = JSON.parse(jsonText, function (key, value) {
        if (value && typeof value === 'object' && value.__type === 'BigInt' && value.__value !== undefined) {
          return BigInt(value.__value);
        }
        return value;
      });
    } catch (e) {
      return { ok: false, reason: 'syntax', error: e.message };
    }

    if (typeof data !== 'object' || data === null) {
      return { ok: false, reason: 'parse', error: 'Invalid save file structure' };
    }

    // Sanity-check: require at least one known PokeRogue key
    const VALIDATION_KEYS = ['dexData', 'trainerId', 'starterData', 'gameStats', 'voucherCounts'];
    if (!VALIDATION_KEYS.some(k => k in data)) {
      return { ok: false, reason: 'invalid', error: 'File does not appear to be a PokeRogue save (missing expected fields)' };
    }

    let restored = 0;

    // Priority: restore known persistent keys first, then any remaining data keys
    const importKeys = [...new Set([
      ...SAVE_DATA_KEYS.filter(k => k in data),
      ...Object.keys(data),
    ])];
    const total = importKeys.length;

    for (let i = 0; i < importKeys.length; i++) {
      try {
        const val = data[importKeys[i]];
        if (typeof val !== 'function') {
          gd[importKeys[i]] = val;
          restored++;
        }
      } catch (_) {}

      if (typeof onProgress === 'function' && i % 5 === 0) {
        onProgress(restored, total, Math.round(((i + 1) / total) * 100));
        await waitTick();
      }
    }

    if (typeof onProgress === 'function') onProgress(restored, total, 100);
    await triggerAutosaveAfterEggChange();
    return { ok: true, restored };
  }

  // ─── TOAST ───────────────────────────────────────────────────────────────

  function showToast(message, isError = false) {
    const ex = document.getElementById('pr-toast');
    if (ex) ex.remove();
    const t = document.createElement('div');
    t.id = 'pr-toast';
    t.textContent = message;
    Object.assign(t.style, {
      position: 'fixed', bottom: '80px', right: '24px',
      background: isError ? '#3d0f0f' : '#0d2e1a',
      color: isError ? '#fca5a5' : '#86efac',
      border: '1px solid ' + (isError ? '#dc2626' : '#22c55e'),
      borderRadius: '8px', padding: '11px 16px',
      fontFamily: "'Share Tech Mono', monospace", fontSize: '13px',
      zIndex: '999999', opacity: '0', transition: 'opacity 0.2s',
      pointerEvents: 'none', maxWidth: '320px', lineHeight: '1.4',
    });
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = '1'; });
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
  }

  // ─── SECTIONS ────────────────────────────────────────────────────────────

  const SECTIONS = [
    {
      id: 'eggs',
      icon: '🥚',
      label: 'Eggs',
      description: 'Vouchers, pull limits & egg storage',
      buildContent(container) {
        container.innerHTML = `
          <div class="pr-card">
            <div class="pr-card-header">
              <div class="pr-card-title">Voucher Counts</div>
              <div class="pr-card-desc">Set how many of each voucher type you have</div>
            </div>
            <div class="pr-voucher-grid">
              <div class="pr-voucher-card">
                <span class="pr-voucher-tier">Regular</span>
                <span class="pr-voucher-val" id="pv-cur-0">—</span>
                <input class="pr-input pr-voucher-input" id="pv-in-0" type="number" min="0" max="9999" placeholder="new value">
              </div>
              <div class="pr-voucher-card">
                <span class="pr-voucher-tier">Plus</span>
                <span class="pr-voucher-val" id="pv-cur-1">—</span>
                <input class="pr-input pr-voucher-input" id="pv-in-1" type="number" min="0" max="9999" placeholder="new value">
              </div>
              <div class="pr-voucher-card">
                <span class="pr-voucher-tier">Premium</span>
                <span class="pr-voucher-val" id="pv-cur-2">—</span>
                <input class="pr-input pr-voucher-input" id="pv-in-2" type="number" min="0" max="9999" placeholder="new value">
              </div>
              <div class="pr-voucher-card">
                <span class="pr-voucher-tier gold">✦ Golden</span>
                <span class="pr-voucher-val gold" id="pv-cur-3">—</span>
                <input class="pr-input pr-voucher-input" id="pv-in-3" type="number" min="0" max="9999" placeholder="new value">
              </div>
            </div>
            <div class="pr-btn-row">
              <button class="pr-btn green" id="pr-apply">✓ Apply</button>
              <button class="pr-btn purple" id="pr-max">▲ Set 999</button>
              <button class="pr-btn red" id="pr-zero">▼ Set 0</button>
            </div>
          </div>

          <div class="pr-card">
            <div class="pr-toggle-row" id="pr-egg-limit-row">
              <div class="pr-toggle-info">
                <div class="pr-toggle-name">Remove Egg Limit</div>
                <div class="pr-toggle-status" id="pr-egg-count-display">—</div>
              </div>
              <label class="pr-toggle">
                <input type="checkbox" id="pr-egg-limit-toggle">
                <span class="pr-slider"></span>
              </label>
            </div>
          </div>

          <div class="pr-card">
            <div class="pr-card-header">
              <div class="pr-card-title">Give Eggs by Type</div>
              <div class="pr-card-desc">Choose from fixed egg types, add up to 500 at once, or clear your current egg storage</div>
            </div>
            <div class="pr-egg-tools-grid">
              <select class="pr-input" id="pr-egg-type-select"></select>
              <input class="pr-input" id="pr-egg-amount" type="number" min="1" max="500" value="1" placeholder="amount">
            </div>
            <div class="pr-egg-btn-row pr-egg-btn-row-double">
              <button class="pr-btn green" id="pr-egg-add">+ Add Eggs</button>
              <button class="pr-btn red" id="pr-egg-delete-all">🗑 Delete All Eggs</button>
            </div>
          </div>
        `;

        const applyVouchers = () => {
          const counts = getVoucherCounts();
          if (!counts) { showToast('⚠️ Open the Gacha menu first', true); return; }
          const vals = [0, 1, 2, 3].map(i => {
            const raw = container.querySelector('#pv-in-' + i).value;
            return raw === '' ? counts[i] : Math.max(0, parseInt(raw, 10) || 0);
          });
          if (setVoucherCounts(vals)) {
            showToast('✅ Vouchers updated!');
            [0, 1, 2, 3].forEach(i => { container.querySelector('#pv-in-' + i).value = ''; });
          }
        };

        container.querySelector('#pr-apply').addEventListener('click', applyVouchers);
        container.querySelector('#pr-max').addEventListener('click', () => {
          if (setVoucherCounts(999)) showToast('✅ All vouchers set to 999');
          else showToast('⚠️ Open the Gacha menu first', true);
        });
        container.querySelector('#pr-zero').addEventListener('click', () => {
          if (setVoucherCounts(0)) showToast('✅ All vouchers set to 0');
          else showToast('⚠️ Open the Gacha menu first', true);
        });

        container.querySelectorAll('.pr-voucher-input').forEach(inp => {
          inp.addEventListener('keydown', e => {
            if (e.key === 'Enter') applyVouchers();
            e.stopPropagation();
          });
        });

        const limitToggle = container.querySelector('#pr-egg-limit-toggle');
        const limitRow = container.querySelector('#pr-egg-limit-row');
        limitToggle.checked = _eggLimitRemoved;
        if (_eggLimitRemoved) limitRow.classList.add('active');

        limitToggle.addEventListener('change', () => {
          const ok = setEggLimitRemoved(limitToggle.checked);
          if (ok) {
            limitRow.classList.toggle('active', limitToggle.checked);
            showToast(limitToggle.checked ? '✅ Egg limit removed!' : '🔒 Egg limit restored');
          } else {
            limitToggle.checked = false;
            showToast('⚠️ Open the Gacha menu first', true);
          }
        });

        const eggTypeSelect = container.querySelector('#pr-egg-type-select');
        const eggAmountInput = container.querySelector('#pr-egg-amount');
        const eggAddBtn = container.querySelector('#pr-egg-add');
        const eggDeleteAllBtn = container.querySelector('#pr-egg-delete-all');
        let eggAddBusy = false;
        let eggDeleteBusy = false;
        eggTypeSelect.innerHTML = EGG_TYPE_OPTIONS
          .map(o => '<option value="' + o.value + '">' + o.label + '</option>')
          .join('');

        async function applyEggAdd() {
          if (eggAddBusy || eggDeleteBusy) return;
          const typeId = Number(eggTypeSelect.value);
          const amount = Math.min(500, Math.max(1, parseInt(eggAmountInput.value, 10) || 1));
          eggAmountInput.value = String(amount);

          if (!Number.isFinite(typeId)) {
            showToast('⚠️ Select a valid egg type', true);
            return;
          }

          eggAddBusy = true;
          const originalText = eggAddBtn.textContent;
          eggAddBtn.disabled = true;
          eggDeleteAllBtn.disabled = true;
          eggAddBtn.classList.add('pr-loading');
          eggTypeSelect.disabled = true;
          eggAmountInput.disabled = true;

          try {
            const result = await addEggsByType(typeId, amount, (_done, _total, pct) => {
              eggAddBtn.textContent = 'Adding… ' + pct + '%';
            });

            if (result.added > 0) {
              const partial = result.ok ? '' : ' (partial)';
              const typeLabel = EGG_TYPE_OPTIONS.find(o => o.value === typeId)?.label ?? ('Type ' + typeId);
              showToast('✅ Added ' + result.added + ' ' + typeLabel + ' egg(s)' + partial);
              await triggerAutosaveAfterEggChange();
            } else {
              showToast('⚠️ Could not add eggs.', true);
            }
          } finally {
            eggAddBtn.textContent = originalText;
            eggAddBtn.disabled = false;
            eggDeleteAllBtn.disabled = false;
            eggAddBtn.classList.remove('pr-loading');
            eggTypeSelect.disabled = false;
            eggAmountInput.disabled = false;
            eggAddBusy = false;
          }
        }

        async function applyDeleteAllEggs() {
          if (eggAddBusy || eggDeleteBusy) return;

          eggDeleteBusy = true;
          const originalText = eggDeleteAllBtn.textContent;
          eggDeleteAllBtn.disabled = true;
          eggAddBtn.disabled = true;
          eggDeleteAllBtn.classList.add('pr-loading');
          eggTypeSelect.disabled = true;
          eggAmountInput.disabled = true;

          try {
            const result = await deleteAllEggs((_done, _total, pct) => {
              eggDeleteAllBtn.textContent = 'Deleting… ' + pct + '%';
            });
            if (result.ok) {
              showToast('✅ Deleted ' + result.deleted + ' egg(s)');
            } else {
              showToast('⚠️ Could not delete eggs.', true);
            }
          } finally {
            eggDeleteAllBtn.textContent = originalText;
            eggDeleteAllBtn.disabled = false;
            eggAddBtn.disabled = false;
            eggDeleteAllBtn.classList.remove('pr-loading');
            eggTypeSelect.disabled = false;
            eggAmountInput.disabled = false;
            eggDeleteBusy = false;
          }
        }

        eggAddBtn.addEventListener('click', applyEggAdd);
        eggDeleteAllBtn.addEventListener('click', applyDeleteAllEggs);
        eggAmountInput.addEventListener('input', () => {
          const raw = eggAmountInput.value;
          if (raw === '') return;
          const n = parseInt(raw, 10);
          if (!Number.isFinite(n)) {
            eggAmountInput.value = '1';
            return;
          }
          eggAmountInput.value = String(Math.min(500, Math.max(1, n)));
        });
        eggAmountInput.addEventListener('keydown', e => {
          if (e.key === 'Enter') applyEggAdd();
          e.stopPropagation();
        });

        const curEls = [0, 1, 2, 3].map(i => container.querySelector('#pv-cur-' + i));
        const eggCountEl = container.querySelector('#pr-egg-count-display');

        return function tick() {
          const counts = getVoucherCounts();
          curEls.forEach((el, i) => { el.textContent = counts ? counts[i] : '—'; });
          const ec = getEggCount();
          if (ec !== null) {
            eggCountEl.textContent = ec + ' egg' + (ec !== 1 ? 's' : '') + ' stored' +
              (_eggLimitRemoved ? '  •  limit off' : '  •  99 max');
          } else {
            eggCountEl.textContent = 'waiting for game connection';
          }
        };
      }
    },
    // add more sections here
    {
      id: 'pokemon',
      icon: '⚡',
      label: 'Pokémon',
      description: 'Pokédex completion & catch tools',
      buildContent(container) {
        container.innerHTML = `
          <div class="pr-card">
            <div class="pr-card-header">
              <div class="pr-card-title">Pokédex</div>
              <div class="pr-card-desc">Mark every Pokémon as caught, or reset all caught status with confirmation</div>
            </div>
            <div class="pr-dex-stats" id="pr-dex-stats">—</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <button class="pr-btn green" id="pr-catch-all">✓ Catch All Pokémon</button>
              <button class="pr-btn red" id="pr-reset-caught">↺ Reset Caught Status</button>
            </div>
          </div>
        `;

        const statsEl  = container.querySelector('#pr-dex-stats');
        const catchBtn = container.querySelector('#pr-catch-all');
        const resetBtn = container.querySelector('#pr-reset-caught');
        let busy = false;

        function setBusyState(nextBusy) {
          busy = nextBusy;
          catchBtn.disabled = nextBusy;
          resetBtn.disabled = nextBusy;
        }

        catchBtn.addEventListener('click', async () => {
          if (busy) return;
          const gd = findGameData();
          if (!gd?.dexData) { showToast('⚠️ No game data found', true); return; }

          setBusyState(true);
          catchBtn.classList.add('pr-loading');
          const origText = catchBtn.textContent;

          try {
            const result = await catchAllPokemon((_done, _total, pct) => {
              catchBtn.textContent = 'Working… ' + pct + '%';
            });
            if (result.ok) {
              showToast('✅ Caught ' + result.updated + ' Pokémon!');
            } else {
              showToast('⚠️ Open a game save first', true);
            }
          } finally {
            catchBtn.textContent = origText;
            catchBtn.classList.remove('pr-loading');
            setBusyState(false);
          }
        });

        resetBtn.addEventListener('click', async () => {
          if (busy) return;
          const gd = findGameData();
          if (!gd?.dexData) { showToast('⚠️ No game data found', true); return; }

          const confirmed = globalThis.confirm('⚠️ This will mark all Pokémon as uncaught in your Pokédex. Continue?');
          if (!confirmed) return;

          setBusyState(true);
          resetBtn.classList.add('pr-loading');
          const origText = resetBtn.textContent;

          try {
            const result = await resetCaughtPokemon((_done, _total, pct) => {
              resetBtn.textContent = 'Resetting… ' + pct + '%';
            });
            if (result.ok) {
              showToast('✅ Reset caught status for ' + result.updated + ' Pokémon');
            } else {
              showToast('⚠️ Open a game save first', true);
            }
          } finally {
            resetBtn.textContent = origText;
            resetBtn.classList.remove('pr-loading');
            setBusyState(false);
          }
        });

        return function tick() {
          const stats = getDexStats();
          if (stats) {
            statsEl.textContent = stats.caught + ' / ' + stats.total + ' caught';
          } else {
            statsEl.textContent = 'waiting for game connection';
          }
        };
      }
    },
    {
      id: 'savedata',
      icon: '💾',
      label: 'Save Data',
      description: 'Export & import your full game progress',
      buildContent(container) {
        container.innerHTML = `
          <div class="pr-card pr-save-warn-card">
            <div style="display:flex;align-items:center;gap:10px">
              <span style="font-size:22px;flex-shrink:0;line-height:1">⚠️</span>
              <div style="font-size:15px;color:#f0b429;line-height:1.55">
                Always <strong>export a backup</strong> before importing. Importing overwrites your current in-memory save data immediately.
              </div>
            </div>
          </div>

          <div class="pr-card">
            <div class="pr-card-header">
              <div class="pr-card-title">Export Save Data</div>
              <div class="pr-card-desc">Downloads your complete game progress as a JSON file — Pokédex, starter data, eggs, vouchers, achievements, game stats, and all other persistent fields.</div>
            </div>
            <div class="pr-save-stats" id="pr-save-stats">waiting for game connection…</div>
            <div class="pr-save-progress-wrap" id="pr-export-progress-wrap" style="display:none">
              <div class="pr-save-progress-bar" id="pr-export-bar"></div>
            </div>
            <button class="pr-btn green" id="pr-export-save" style="width:100%">⬇ Export to File</button>
          </div>

          <div class="pr-card">
            <div class="pr-card-header">
              <div class="pr-card-title">Import Save Data</div>
              <div class="pr-card-desc">Load a previously exported JSON file to restore all persistent game progress, then auto-save to the server.</div>
            </div>
            <input type="file" id="pr-import-file" accept=".json" style="display:none">
            <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:stretch">
              <div class="pr-input pr-import-filename" id="pr-import-filename" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#4e6080;display:flex;align-items:center;border-radius:8px">No file selected…</div>
              <button class="pr-btn" id="pr-import-choose">Browse</button>
            </div>
            <div class="pr-save-fileinfo" id="pr-import-fileinfo" style="display:none"></div>
            <div class="pr-save-progress-wrap" id="pr-import-progress-wrap" style="display:none">
              <div class="pr-save-progress-bar" id="pr-import-bar"></div>
            </div>
            <button class="pr-btn green" id="pr-import-save" disabled style="width:100%">⬆ Import from File</button>
          </div>
        `;

        const exportBtn        = container.querySelector('#pr-export-save');
        const exportProgressWrap = container.querySelector('#pr-export-progress-wrap');
        const exportBar        = container.querySelector('#pr-export-bar');
        const statsEl          = container.querySelector('#pr-save-stats');
        const fileInput        = container.querySelector('#pr-import-file');
        const filenameEl       = container.querySelector('#pr-import-filename');
        const fileinfoEl       = container.querySelector('#pr-import-fileinfo');
        const chooseBtn        = container.querySelector('#pr-import-choose');
        const importBtn        = container.querySelector('#pr-import-save');
        const importProgressWrap = container.querySelector('#pr-import-progress-wrap');
        const importBar        = container.querySelector('#pr-import-bar');
        let selectedFile       = null;
        let busy               = false;

        function setExportProgress(label, pct) {
          exportBtn.textContent = label;
          exportProgressWrap.style.display = '';
          exportBar.style.width = pct + '%';
        }

        function setImportProgress(label, pct) {
          importBtn.textContent = label;
          importProgressWrap.style.display = '';
          importBar.style.width = pct + '%';
        }

        exportBtn.addEventListener('click', async () => {
          if (busy) return;
          busy = true;
          exportBtn.disabled = true;
          importBtn.disabled = true;
          exportBtn.classList.add('pr-loading');
          const origText = exportBtn.textContent;

          try {
            const result = await exportSaveData((label, pct) => setExportProgress(label, pct));
            if (result.ok) {
              setExportProgress('Done! (' + result.kb + ' KB)', 100);
              exportBtn.classList.remove('pr-loading');
              showToast('✅ Save data exported — ' + result.kb + ' KB');
              setTimeout(() => {
                exportProgressWrap.style.display = 'none';
                exportBar.style.width = '0%';
                exportBtn.textContent = origText;
              }, 2000);
            } else if (result.reason === 'connect') {
              showToast('⚠️ No game data found — open a save first', true);
              exportBtn.textContent = origText;
              exportProgressWrap.style.display = 'none';
              exportBtn.classList.remove('pr-loading');
            } else {
              showToast('⚠️ Export failed: ' + (result.error || result.reason), true);
              exportBtn.textContent = origText;
              exportProgressWrap.style.display = 'none';
              exportBtn.classList.remove('pr-loading');
            }
          } catch (e) {
            showToast('⚠️ Export failed: ' + e.message, true);
            exportBtn.textContent = origText;
            exportProgressWrap.style.display = 'none';
            exportBtn.classList.remove('pr-loading');
          } finally {
            busy = false;
            exportBtn.disabled = false;
            importBtn.disabled = !selectedFile;
          }
        });

        chooseBtn.addEventListener('click', () => { if (!busy) fileInput.click(); });

        fileInput.addEventListener('change', () => {
          const file = fileInput.files?.[0];
          if (file) {
            selectedFile = file;
            filenameEl.textContent = file.name;
            filenameEl.style.color = '#e0e8ff';
            const kb = Math.round(file.size / 1024);
            const modified = new Date(file.lastModified).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric' });
            fileinfoEl.textContent = kb + ' KB  ·  modified ' + modified;
            fileinfoEl.style.display = '';
            importBtn.disabled = false;
          }
        });

        importBtn.addEventListener('click', async () => {
          if (!selectedFile || busy) return;

          const confirmed = globalThis.confirm(
            '⚠️ This will overwrite your current in-memory save data with the contents of:\n\n' +
            selectedFile.name + '\n\nThis cannot be undone. Continue?'
          );
          if (!confirmed) return;

          busy = true;
          importBtn.disabled = true;
          exportBtn.disabled = true;
          chooseBtn.disabled = true;
          importBtn.classList.add('pr-loading');
          const origText = importBtn.textContent;

          try {
            setImportProgress('Reading file… 0%', 0);
            await waitTick();
            const text = await selectedFile.text();
            setImportProgress('Parsing… 20%', 20);
            await waitTick();

            const result = await importSaveData(text, (_done, _total, pct) => {
              const clamped = 20 + Math.round(pct * 0.7);
              setImportProgress('Restoring… ' + pct + '%', clamped);
            });

            if (result.ok) {
              setImportProgress('Saving… 95%', 95);
              await waitTick();
              setImportProgress('Done!', 100);
              importBtn.classList.remove('pr-loading');
              showToast('✅ Imported — ' + result.restored + ' fields restored');
              setTimeout(() => {
                importProgressWrap.style.display = 'none';
                importBar.style.width = '0%';
                importBtn.textContent = origText;
              }, 2000);
            } else if (result.reason === 'connect') {
              showToast('⚠️ No game data found — open a save first', true);
              importBtn.textContent = origText;
              importProgressWrap.style.display = 'none';
              importBtn.classList.remove('pr-loading');
            } else if (result.reason === 'syntax') {
              showToast('⚠️ JSON syntax error — file may be corrupted or incomplete', true);
              importBtn.textContent = origText;
              importProgressWrap.style.display = 'none';
              importBtn.classList.remove('pr-loading');
            } else if (result.reason === 'parse') {
              showToast('⚠️ Invalid save file: ' + (result.error || 'parse error'), true);
              importBtn.textContent = origText;
              importProgressWrap.style.display = 'none';
              importBtn.classList.remove('pr-loading');
            } else if (result.reason === 'invalid') {
              showToast('⚠️ ' + (result.error || 'Not a valid PokeRogue save file'), true);
              importBtn.textContent = origText;
              importProgressWrap.style.display = 'none';
              importBtn.classList.remove('pr-loading');
            } else {
              showToast('⚠️ Import failed: ' + (result.error || result.reason), true);
              importBtn.textContent = origText;
              importProgressWrap.style.display = 'none';
              importBtn.classList.remove('pr-loading');
            }
          } catch (e) {
            showToast('⚠️ Import failed: ' + e.message, true);
            importBtn.textContent = origText;
            importProgressWrap.style.display = 'none';
            importBtn.classList.remove('pr-loading');
          } finally {
            busy = false;
            importBtn.disabled = false;
            exportBtn.disabled = false;
            chooseBtn.disabled = false;
          }
        });

        return function tick() {
          const gd = findGameData();
          if (!gd) { statsEl.textContent = 'waiting for game connection…'; return; }
          const parts = [];
          if (gd.dexData) {
            const keys = Object.keys(gd.dexData);
            const caught = keys.filter(k => gd.dexData[k]?.caughtAttr).length;
            parts.push('Pokédex ' + caught + ' / ' + keys.length);
          }
          if (Array.isArray(gd.eggs)) parts.push(gd.eggs.length + ' egg' + (gd.eggs.length !== 1 ? 's' : ''));
          if (gd.achvUnlocks) {
            const count = Object.keys(gd.achvUnlocks).length;
            if (count > 0) parts.push(count + ' achievement' + (count !== 1 ? 's' : ''));
          }
          if (gd.voucherCounts) {
            const total = Object.values(gd.voucherCounts).reduce((s, v) => s + (v || 0), 0);
            if (total > 0) parts.push(total + ' voucher' + (total !== 1 ? 's' : ''));
          }
          statsEl.textContent = parts.length ? parts.join(' · ') : 'No summary data available';
        };
      }
    },
    {
      id: 'gamestats',
      icon: '📊',
      label: 'Game Stats',
      description: 'Live read-out of battle, catch, egg & session counters',
      buildContent(container) {
        container.innerHTML = `
          <div class="pr-card">
            <div class="pr-card-header">
              <div class="pr-card-title">Game Statistics</div>
              <div class="pr-card-desc">Live read-out — updates every second</div>
            </div>
            <div class="pr-stats-grid" id="pr-stats-grid">
              <div class="pr-stats-waiting">waiting for game connection…</div>
            </div>
          </div>
        `;

        const gridEl = container.querySelector('#pr-stats-grid');
        let rendered = false;

        function renderStats(stats) {
          if (!stats) {
            gridEl.innerHTML = '<div class="pr-stats-waiting">waiting for game connection…</div>';
            rendered = false;
            return;
          }
          if (!rendered) {
            rendered = true;
            gridEl.innerHTML = Object.keys(stats).map(k =>
              '<div class="pr-stat-card">' +
                '<div class="pr-stat-label">' + formatStatKey(k) + '</div>' +
                '<div class="pr-stat-value" data-key="' + k + '">' + stats[k].toLocaleString() + '</div>' +
              '</div>'
            ).join('');
          } else {
            gridEl.querySelectorAll('.pr-stat-value').forEach(el => {
              const live = stats[el.dataset.key];
              if (live !== undefined) el.textContent = live.toLocaleString();
            });
          }
        }

        return function tick() {
          renderStats(getGameStats());
        };
      }
    },
    // add more sections here
  ];

  // ─── GUI ─────────────────────────────────────────────────────────────────

  let _sectionTick = null;
  let _statusTimer = null;

  function buildGUI() {
    if (document.getElementById('pr-cheat-gui')) return;
    const overlay = document.createElement('div');
    overlay.id = 'pr-cheat-gui';

    const style = document.createElement('style');

    const css = [
      "@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@700&display=swap');",

      // overlay
      '#pr-cheat-gui{position:fixed;inset:0;z-index:999998;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.72);backdrop-filter:blur(12px);animation:pr-in .18s ease}',
      '@keyframes pr-in{from{opacity:0}to{opacity:1}}',
      '@keyframes pr-out{from{opacity:1}to{opacity:0}}',
      '#pr-cheat-gui.pr-closing{animation:pr-out .18s ease forwards}',

      // panel
      '#pr-panel{background:#0f1219;border:1px solid #2e3a52;border-radius:16px;width:560px;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 0 0 1px #1a2235,0 32px 80px rgba(0,0,0,.95);overflow:hidden;font-family:"Share Tech Mono",monospace}',

      // titlebar
      '#pr-bar{background:linear-gradient(160deg,#161d2e 0%,#0f1219 100%);border-bottom:1px solid #2e3a52;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;user-select:none;flex-shrink:0;gap:10px}',
      '#pr-bar-left{display:flex;align-items:center;gap:10px;flex:1;min-width:0}',
      '#pr-back{background:none;border:1px solid #2e3a52;border-radius:6px;color:#7c8fff;cursor:pointer;width:28px;height:28px;display:none;align-items:center;justify-content:center;font-size:20px;line-height:1;transition:all .15s;flex-shrink:0}',
      '#pr-back:hover{border-color:#7c8fff;background:#1a2040}',
      '#pr-back.visible{display:flex}',
      '#pr-bar-title{font-family:"Orbitron",monospace;font-size:16px;font-weight:700;color:#7c8fff;letter-spacing:.14em;text-transform:uppercase}',
      '#pr-bar-sub{font-size:15px;color:#8a9ab8;margin-top:3px;letter-spacing:.1em;text-transform:uppercase}',
      '#pr-close{background:none;border:1px solid #2e3a52;border-radius:6px;color:#6b7fa0;cursor:pointer;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:17px;line-height:1;transition:all .15s;flex-shrink:0}',
      '#pr-close:hover{border-color:#f87171;color:#f87171;background:#2d1010}',

      // body
      '#pr-body{flex:1;overflow-y:auto;min-height:0}',
      '#pr-body::-webkit-scrollbar{width:3px}',
      '#pr-body::-webkit-scrollbar-thumb{background:#2e3a52;border-radius:2px}',

      // home
      '#pr-home{padding:14px;display:flex;flex-direction:column;gap:8px}',
      '.pr-home-label{font-size:15px;color:#8a9ab8;letter-spacing:.18em;text-transform:uppercase;padding:2px 4px;margin-bottom:2px}',
      '.pr-category-btn{display:flex;align-items:center;gap:14px;background:#141b28;border:1px solid #2a3650;border-radius:12px;padding:16px 14px;cursor:pointer;width:100%;text-align:left;transition:all .18s}',
      '.pr-category-btn:hover{border-color:#7c8fff;background:#181f30;transform:translateX(2px)}',
      '.pr-category-btn:active{transform:scale(.99)}',
      '.pr-cat-icon{font-size:26px;flex-shrink:0;width:34px;text-align:center;line-height:1}',
      '.pr-cat-info{flex:1;min-width:0}',
      '.pr-cat-label{font-family:"Orbitron",monospace;font-size:15px;color:#c4ccff;letter-spacing:.08em;text-transform:uppercase;margin-bottom:5px}',
      '.pr-cat-desc{font-size:15px;color:#9aaac0;line-height:1.4}',
      '.pr-cat-arrow{color:#4a5e80;font-size:24px;flex-shrink:0;transition:all .18s;line-height:1}',
      '.pr-category-btn:hover .pr-cat-arrow{color:#7c8fff;transform:translateX(3px)}',

      // section
      '#pr-section{padding:14px;display:none;flex-direction:column;gap:10px}',
      '#pr-section.visible{display:flex}',

      // cards
      '.pr-card{background:#141b28;border:1px solid #2a3650;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:12px}',
      '.pr-card-header{display:flex;flex-direction:column;gap:4px;padding-bottom:12px;border-bottom:1px solid #1e2d40}',
      '.pr-card-title{font-size:18px;color:#d0d8f0;letter-spacing:.03em}',
      '.pr-card-desc{font-size:15px;color:#8a9ab8;line-height:1.5}',
      '.pr-dex-stats{font-size:22px;color:#7c8fff;font-weight:700;letter-spacing:.04em;padding:2px 0}',

      // voucher grid
      '.pr-voucher-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
      '.pr-voucher-card{background:#0f1219;border:1px solid #2a3650;border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;transition:border-color .15s;overflow:hidden}',
      '.pr-voucher-card:focus-within{border-color:#7c8fff}',
      '.pr-voucher-tier{font-size:13px;color:#9aaac0;letter-spacing:.12em;text-transform:uppercase}',
      '.pr-voucher-tier.gold{color:#a07820}',
      '.pr-voucher-val{font-size:24px;color:#7c8fff;font-weight:700;line-height:1.15;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.pr-voucher-val.gold{color:#f0b429}',
      '.pr-input{background:#1a2235;border:1px solid #2a3650;border-radius:6px;color:#e0e8ff;font-family:"Share Tech Mono",monospace;font-size:15px;padding:7px 9px;width:100%;box-sizing:border-box;outline:none;transition:border-color .15s,background .15s}',
      '.pr-input:focus{border-color:#7c8fff;background:#1e2840}',
      '.pr-input::placeholder{color:#4e6080}',
      '.pr-input::-webkit-outer-spin-button,.pr-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}',
      '.pr-input[type=number]{-moz-appearance:textfield}',
      '.pr-egg-tools-grid{display:grid;grid-template-columns:minmax(0,1fr) 110px;gap:8px}',
      '#pr-egg-type-select{min-width:0}',
      '#pr-egg-amount{text-align:center}',
      '.pr-egg-btn-row{display:grid;grid-template-columns:1fr;gap:8px}',
      '.pr-egg-btn-row-double{grid-template-columns:1fr 1fr}',

      // buttons
      '.pr-btn-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}',
      '.pr-btn{background:#1a2235;border:1px solid #2a3650;border-radius:8px;padding:11px 10px;cursor:pointer;font-family:"Share Tech Mono",monospace;font-size:16px;color:#7a8aaa;transition:all .15s;text-align:center;white-space:nowrap}',
      '.pr-btn:hover{background:#1e2840;color:#e0e8ff;border-color:#4a5a80}',
      '.pr-btn:active{transform:scale(.97)}',
      '.pr-btn:disabled{cursor:not-allowed;opacity:.75;pointer-events:none;transform:none}',
      '.pr-btn.green{color:#4ade80;border-color:#1a4030;background:#0e1e14}',
      '.pr-btn.green:hover{background:#142a1e;border-color:#22c55e;color:#86efac}',
      '.pr-btn.green.pr-loading{color:#fde68a;border-color:#b45309;background:#2a1708}',
      '.pr-btn.green.pr-loading:hover{color:#fde68a;border-color:#b45309;background:#2a1708}',
      '.pr-btn.purple{color:#c4b5fd;border-color:#3730a3;background:#12102e}',
      '.pr-btn.purple:hover{background:#181450;border-color:#818cf8;color:#ddd6fe}',
      '.pr-btn.red{color:#f87171;border-color:#7f1d1d;background:#1e0e0e}',
      '.pr-btn.red:hover{background:#2a1010;border-color:#dc2626;color:#fca5a5}',
      '.pr-btn.red.pr-loading,.pr-btn.red.pr-loading:hover{color:#fecaca;border-color:#dc2626;background:#3b0d0d}',

      // toggle row (for hacks)
      '.pr-toggle-row{display:flex;align-items:center;justify-content:space-between;gap:16px}',
      '.pr-toggle-info{flex:1;min-width:0}',
      '.pr-toggle-name{font-size:17px;color:#d0d8f0;margin-bottom:5px}',
      '.pr-toggle-status{font-size:15px;color:#9aaac0;line-height:1.4}',
      '.pr-toggle-row.active .pr-toggle-name{color:#a5b4fc}',
      '.pr-toggle-row.active .pr-toggle-status{color:#7c8fff}',

      // toggle switch
      '.pr-toggle{position:relative;width:44px;height:24px;flex-shrink:0}',
      '.pr-toggle input{opacity:0;width:0;height:0}',
      '.pr-slider{position:absolute;inset:0;background:#1a2235;border-radius:24px;cursor:pointer;border:1px solid #2a3650;transition:all .2s}',
      '.pr-slider::before{content:"";position:absolute;height:16px;width:16px;left:3px;top:50%;transform:translateY(-50%);background:#3a4a68;border-radius:50%;transition:transform .2s,background .2s}',
      '.pr-toggle input:checked + .pr-slider{background:#1a1f4a;border-color:#7c8fff}',
      '.pr-toggle input:checked + .pr-slider::before{transform:translateX(20px) translateY(-50%);background:#a5b4fc}',

      // status bar
      '#pr-statusbar{flex-shrink:0;border-top:1px solid #1e2a40;padding:9px 16px;display:flex;align-items:center;gap:8px;background:#0b0f18}',
      '.pr-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;background:#2e3a52;transition:background .3s}',
      '.pr-dot.on{background:#22c55e;box-shadow:0 0 8px rgba(34,197,94,.5)}',
      '.pr-dot.blink{background:#f59e0b;animation:pr-blink 1s infinite}',
      '@keyframes pr-blink{0%,100%{opacity:1}50%{opacity:.25}}',
      '#pr-status-text{font-size:15px;color:#9aaac0;flex:1}',

      // footer
      '#pr-footer{flex-shrink:0;padding:8px 16px 12px;font-size:15px;color:#8a9ab8;text-align:center;letter-spacing:.05em}',
      '#pr-footer kbd{background:#1e2840;border:1px solid #3a4e6a;border-radius:4px;padding:2px 7px;font-family:inherit;color:#a0b0d0}',

      // save data warning card
      '.pr-save-warn-card{background:#1e1408;border-color:#7a4c00}',

      // save data progress bar
      '.pr-save-progress-wrap{height:4px;background:#1a2235;border-radius:2px;overflow:hidden;margin-bottom:2px}',
      '.pr-save-progress-bar{height:100%;width:0%;background:linear-gradient(90deg,#22c55e,#4ade80);border-radius:2px;transition:width .3s ease}',

      // save data stats & file info
      '.pr-save-stats{font-size:14px;color:#7c8fff;letter-spacing:.04em;padding:2px 0;min-height:18px}',
      '.pr-save-fileinfo{font-size:13px;color:#6a7a9a;letter-spacing:.04em;padding:1px 0}',

      // game stats grid
      '.pr-stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}',
      '.pr-stat-card{background:#0f1219;border:1px solid #2a3650;border-radius:8px;padding:8px 10px;display:flex;flex-direction:column;gap:4px}',
      '.pr-stat-label{font-size:10px;color:#6a7a9a;letter-spacing:.1em;text-transform:uppercase;line-height:1.3}',
      '.pr-stat-value{font-size:17px;color:#a5b4fc;font-weight:700;letter-spacing:.02em;line-height:1.2}',
      '.pr-stats-waiting{font-size:14px;color:#5a6a88;grid-column:1/-1;text-align:center;padding:12px 0}',
    ].join('\n');

    style.textContent = css;
    document.head.appendChild(style);

    const homeHTML = SECTIONS.map(s =>
      '<button class="pr-category-btn" data-section="' + s.id + '">' +
        '<span class="pr-cat-icon">' + s.icon + '</span>' +
        '<span class="pr-cat-info">' +
          '<div class="pr-cat-label">' + s.label + '</div>' +
          '<div class="pr-cat-desc">' + s.description + '</div>' +
        '</span>' +
        '<span class="pr-cat-arrow">›</span>' +
      '</button>'
    ).join('');

    overlay.innerHTML =
      '<div id="pr-panel">' +
        '<div id="pr-bar">' +
          '<div id="pr-bar-left">' +
            '<button id="pr-back">‹</button>' +
            '<div>' +
              '<div id="pr-bar-title">PokeRogue</div>' +
              '<div id="pr-bar-sub">CHEAT MENU</div>' +
            '</div>' +
          '</div>' +
          '<button id="pr-close">✕</button>' +
        '</div>' +
        '<div id="pr-body">' +
          '<div id="pr-home">' +
            '<div class="pr-home-label">Categories</div>' +
            homeHTML +
          '</div>' +
          '<div id="pr-section"></div>' +
        '</div>' +
        '<div id="pr-statusbar">' +
          '<span class="pr-dot blink" id="pr-dot"></span>' +
          '<span id="pr-status-text">Searching for game…</span>' +
        '</div>' +
        '<div id="pr-footer">v' + getScriptVersion() + ' · Press <kbd>' + TOGGLE_KEY + '</kbd> to open / close</div>' +
      '</div>';

    document.body.appendChild(overlay);

    // ── navigation ──
    const panel     = overlay.querySelector('#pr-panel');
    const homeEl    = overlay.querySelector('#pr-home');
    const sectionEl = overlay.querySelector('#pr-section');
    const backBtn   = overlay.querySelector('#pr-back');
    const barSub    = overlay.querySelector('#pr-bar-sub');

    function animatePanelHeight(changeFn) {
      // 1. pin current height (no transition yet)
      const fromH = panel.offsetHeight;
      panel.style.transition = 'none';
      panel.style.height = fromH + 'px';

      // 2. apply the content change
      changeFn();

      // 3. measure the natural target height without painting (still in same JS task)
      panel.style.height = '';
      const toH = panel.offsetHeight; // forces sync reflow → captures new natural height
      panel.style.height = fromH + 'px'; // snap back to start
      void panel.offsetHeight; // commit the snap

      // 4. animate to target
      panel.style.transition = 'height .28s cubic-bezier(0.4,0,0.2,1)';
      panel.style.height = toH + 'px';

      // 5. clean up once done so CSS max-height takes over again
      panel.addEventListener('transitionend', e => {
        if (e.propertyName === 'height') {
          panel.style.height = '';
          panel.style.transition = '';
        }
      }, { once: true });
    }

    function goHome() {
      animatePanelHeight(() => {
        activeSection = null;
        if (_sectionTick) { clearInterval(_sectionTick); _sectionTick = null; }
        homeEl.style.display = '';
        sectionEl.className = 'pr-section';
        sectionEl.innerHTML = '';
        backBtn.classList.remove('visible');
        barSub.textContent = 'CHEAT MENU';
      });
    }
    overlay._goHome = goHome;

    function goSection(id) {
      const sec = SECTIONS.find(s => s.id === id);
      if (!sec) return;
      animatePanelHeight(() => {
        activeSection = id;
        homeEl.style.display = 'none';
        sectionEl.className = 'pr-section visible';
        sectionEl.innerHTML = '';
        backBtn.classList.add('visible');
        barSub.textContent = sec.label.toUpperCase();
        const tick = sec.buildContent(sectionEl);
        if (typeof tick === 'function') {
          tick();
          _sectionTick = setInterval(tick, 800);
        }
      });
    }

    overlay.querySelectorAll('.pr-category-btn').forEach(btn => {
      btn.addEventListener('click', () => goSection(btn.dataset.section));
    });
    backBtn.addEventListener('click', goHome);

    // ── status bar ──
    const dot        = overlay.querySelector('#pr-dot');
    const statusText = overlay.querySelector('#pr-status-text');

    function startStatusTimer() {
      if (_statusTimer) clearInterval(_statusTimer);
      _statusTimer = setInterval(() => {
        const gd = findGameData();
        if (gd) {
          dot.className = 'pr-dot on';
          statusText.textContent = 'Connected to game';
        } else {
          dot.className = 'pr-dot blink';
          statusText.textContent = 'Waiting for game connection…';
        }
      }, 1000);
    }
    overlay._startStatusTimer = startStatusTimer;
    startStatusTimer();

    // ── close / backdrop ──
    overlay.querySelector('#pr-close').addEventListener('click', hideGUI);
    overlay.addEventListener('click', e => { if (e.target === overlay) hideGUI(); });

    overlay._cleanup = () => {
      if (_sectionTick) { clearInterval(_sectionTick); _sectionTick = null; }
      if (_statusTimer) { clearInterval(_statusTimer); _statusTimer = null; }
    };
  }

  function showGUI() {
    const existing = document.getElementById('pr-cheat-gui');
    if (existing) {
      existing.classList.remove('pr-closing');
      existing.style.display = '';
      // restart the open animation
      existing.style.animation = 'none';
      void existing.offsetHeight; // force reflow
      existing.style.animation = '';
      existing._startStatusTimer?.();
      guiVisible = true;
    } else {
      buildGUI();
      guiVisible = true;
    }
  }
  function hideGUI() {
    const el = document.getElementById('pr-cheat-gui');
    if (el) {
      el._cleanup?.();
      el._goHome?.();
      el.classList.add('pr-closing');
      el.addEventListener('animationend', () => {
        el.classList.remove('pr-closing');
        el.style.display = 'none';
      }, { once: true });
    }
    activeSection = null;
    guiVisible = false;
  }
  function toggleGUI() { guiVisible ? hideGUI() : showGUI(); }

  document.addEventListener('keydown', e => {
    if (e.key === TOGGLE_KEY) { e.preventDefault(); toggleGUI(); return; }
    if (guiVisible) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); hideGUI(); return; }
      // Block all other keypresses from reaching the game while the menu is open
      e.stopImmediatePropagation();
    }
  }, true);

  // corner pill
  const pill = document.createElement('div');
  Object.assign(pill.style, {
    position: 'fixed', bottom: '12px', right: '12px',
    background: '#141b28', border: '1px solid #2a3650',
    borderRadius: '6px', padding: '5px 10px',
    fontFamily: "'Share Tech Mono', monospace", fontSize: '11px',
    color: '#5a6a88', zIndex: '999997', cursor: 'pointer',
    userSelect: 'none', letterSpacing: '0.1em',
  });
  pill.textContent = '[' + TOGGLE_KEY + '] CHEATS';
  pill.addEventListener('click', toggleGUI);
  document.body.appendChild(pill);

})();
