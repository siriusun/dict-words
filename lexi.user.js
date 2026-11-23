// ==UserScript==
// @name         Lexi · 划词词典与复习
// @namespace    lexi-local
// @version      0.9.2
// @description  英文划词与句子翻译、触屏选区操作、发音、跨网站历史、生词复习与本地备份。
// @match        http://*/*
// @match        https://*/*
// @noframes
// @run-at       document-idle
// @sandbox      DOM
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// @connect      api.dictionaryapi.dev
// @connect      api.mymemory.translated.net
// @connect      translate.googleapis.com
// @connect      edge.microsoft.com
// @connect      dict.youdao.com
// @connect      api.datamuse.com
// @connect      dav.jianguoyun.com
// @license      MIT
// ==/UserScript==

(() => {
  'use strict';
  let memory;
  function loadMemory() {
    if (memory) return;
    memory = (() => {
    const exports = {};
    const module = { exports };
    // BEGIN VENDORED TS-FSRS 5.4.2
/* TS-FSRS 5.4.2, upstream UMD bundle (whitespace normalized)
 * https://cdn.jsdelivr.net/npm/ts-fsrs@5.4.2/dist/index.umd.js
 * SHA-256: 59b7444121d0aae5bb969097ed95df38eff4a4f878e459703c63720f6b6a176b

MIT License

Copyright (c) 2026 Open Spaced Repetition

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.FSRS = {}));
})(this, (function (exports) { 'use strict';

  class FSRSError extends Error {
    constructor(message = "FSRS Error") {
      var _a;
      super(message);
      this.name = "FSRSError";
      (_a = Error.captureStackTrace) == null ? void 0 : _a.call(Error, this, FSRSError);
    }
  }
  class FSRSValidationError extends FSRSError {
    constructor(message) {
      var _a;
      super(message);
      this.name = "FSRSValidationError";
      (_a = Error.captureStackTrace) == null ? void 0 : _a.call(Error, this, FSRSValidationError);
    }
  }

  var State = /* @__PURE__ */ ((State2) => {
    State2[State2["New"] = 0] = "New";
    State2[State2["Learning"] = 1] = "Learning";
    State2[State2["Review"] = 2] = "Review";
    State2[State2["Relearning"] = 3] = "Relearning";
    return State2;
  })(State || {});
  var Rating = /* @__PURE__ */ ((Rating2) => {
    Rating2[Rating2["Manual"] = 0] = "Manual";
    Rating2[Rating2["Again"] = 1] = "Again";
    Rating2[Rating2["Hard"] = 2] = "Hard";
    Rating2[Rating2["Good"] = 3] = "Good";
    Rating2[Rating2["Easy"] = 4] = "Easy";
    return Rating2;
  })(Rating || {});

  var __defProp$6 = Object.defineProperty;
  var __defProps$2 = Object.defineProperties;
  var __getOwnPropDescs$2 = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols$2 = Object.getOwnPropertySymbols;
  var __hasOwnProp$2 = Object.prototype.hasOwnProperty;
  var __propIsEnum$2 = Object.prototype.propertyIsEnumerable;
  var __defNormalProp$6 = (obj, key, value) => key in obj ? __defProp$6(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues$2 = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp$2.call(b, prop))
        __defNormalProp$6(a, prop, b[prop]);
    if (__getOwnPropSymbols$2)
      for (var prop of __getOwnPropSymbols$2(b)) {
        if (__propIsEnum$2.call(b, prop))
          __defNormalProp$6(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps$2 = (a, b) => __defProps$2(a, __getOwnPropDescs$2(b));
  class TypeConvert {
    static card(card) {
      return __spreadProps$2(__spreadValues$2({}, card), {
        state: TypeConvert.state(card.state),
        due: TypeConvert.time(card.due),
        last_review: card.last_review ? TypeConvert.time(card.last_review) : void 0
      });
    }
    static rating(value) {
      if (typeof value === "string") {
        const firstLetter = value.charAt(0).toUpperCase();
        const restOfString = value.slice(1).toLowerCase();
        const ret = Rating[`${firstLetter}${restOfString}`];
        if (ret === void 0) {
          throw new FSRSValidationError(`Invalid rating:[${value}]`);
        }
        return ret;
      } else if (typeof value === "number") {
        return value;
      }
      throw new FSRSValidationError(`Invalid rating:[${value}]`);
    }
    static state(value) {
      if (typeof value === "string") {
        const firstLetter = value.charAt(0).toUpperCase();
        const restOfString = value.slice(1).toLowerCase();
        const ret = State[`${firstLetter}${restOfString}`];
        if (ret === void 0) {
          throw new FSRSValidationError(`Invalid state:[${value}]`);
        }
        return ret;
      } else if (typeof value === "number") {
        return value;
      }
      throw new FSRSValidationError(`Invalid state:[${value}]`);
    }
    static time(value) {
      if (value instanceof Date) {
        return value;
      }
      const date = new Date(value);
      if (typeof value === "object" && value !== null && !Number.isNaN(Date.parse(value) || +date)) {
        return date;
      } else if (typeof value === "string") {
        const timestamp = Date.parse(value);
        if (!Number.isNaN(timestamp)) {
          return new Date(timestamp);
        } else {
          throw new FSRSValidationError(`Invalid date:[${value}]`);
        }
      } else if (typeof value === "number") {
        return new Date(value);
      }
      throw new FSRSValidationError(`Invalid date:[${value}]`);
    }
    static review_log(log) {
      return __spreadProps$2(__spreadValues$2({}, log), {
        due: TypeConvert.time(log.due),
        rating: TypeConvert.rating(log.rating),
        state: TypeConvert.state(log.state),
        review: TypeConvert.time(log.review)
      });
    }
  }

  /* istanbul ignore next -- @preserve */
  Date.prototype.scheduler = function(t, isDay) {
    return date_scheduler(this, t, isDay);
  };
  /* istanbul ignore next -- @preserve */
  Date.prototype.diff = function(pre, unit) {
    return date_diff(this, pre, unit);
  };
  /* istanbul ignore next -- @preserve */
  Date.prototype.format = function() {
    return formatDate(this);
  };
  /* istanbul ignore next -- @preserve */
  Date.prototype.dueFormat = function(last_review, unit, timeUnit) {
    return show_diff_message(this, last_review, unit, timeUnit);
  };
  function date_scheduler(now, t, isDay) {
    return new Date(
      isDay ? TypeConvert.time(now).getTime() + t * 24 * 60 * 60 * 1e3 : TypeConvert.time(now).getTime() + t * 60 * 1e3
    );
  }
  function date_diff(now, pre, unit) {
    if (!now || !pre) {
      throw new FSRSValidationError("Invalid date");
    }
    const diff = TypeConvert.time(now).getTime() - TypeConvert.time(pre).getTime();
    let r = 0;
    switch (unit) {
      case "days":
        r = Math.floor(diff / (24 * 60 * 60 * 1e3));
        break;
      case "minutes":
        r = Math.floor(diff / (60 * 1e3));
        break;
    }
    return r;
  }
  function formatDate(dateInput) {
    const date = TypeConvert.time(dateInput);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    return `${year}-${padZero(month)}-${padZero(day)} ${padZero(hours)}:${padZero(
    minutes
  )}:${padZero(seconds)}`;
  }
  function padZero(num) {
    return num < 10 ? `0${num}` : `${num}`;
  }
  const TIMEUNIT = [60, 60, 24, 31, 12];
  const TIMEUNITFORMAT = ["second", "min", "hour", "day", "month", "year"];
  function show_diff_message(due, last_review, unit, timeUnit = TIMEUNITFORMAT) {
    due = TypeConvert.time(due);
    last_review = TypeConvert.time(last_review);
    if (timeUnit.length !== TIMEUNITFORMAT.length) {
      timeUnit = TIMEUNITFORMAT;
    }
    let diff = due.getTime() - last_review.getTime();
    let i = 0;
    diff /= 1e3;
    for (i = 0; i < TIMEUNIT.length; i++) {
      if (diff < TIMEUNIT[i]) {
        break;
      } else {
        diff /= TIMEUNIT[i];
      }
    }
    return `${Math.floor(diff)}${unit ? timeUnit[i] : ""}`;
  }
  /* istanbul ignore next -- @preserve */
  function fixDate(value) {
    return TypeConvert.time(value);
  }
  /* istanbul ignore next -- @preserve */
  function fixState(value) {
    return TypeConvert.state(value);
  }
  /* istanbul ignore next -- @preserve */
  function fixRating(value) {
    return TypeConvert.rating(value);
  }
  const Grades = Object.freeze([
    Rating.Again,
    Rating.Hard,
    Rating.Good,
    Rating.Easy
  ]);
  const FUZZ_RANGES = [
    {
      start: 2.5,
      end: 7,
      factor: 0.15
    },
    {
      start: 7,
      end: 20,
      factor: 0.1
    },
    {
      start: 20,
      end: Infinity,
      factor: 0.05
    }
  ];
  function get_fuzz_range(interval, elapsed_days, maximum_interval) {
    let delta = 1;
    for (const range of FUZZ_RANGES) {
      delta += range.factor * Math.max(Math.min(interval, range.end) - range.start, 0);
    }
    interval = Math.min(interval, maximum_interval);
    let min_ivl = Math.max(2, Math.round(interval - delta));
    const max_ivl = Math.min(Math.round(interval + delta), maximum_interval);
    if (interval > elapsed_days) {
      min_ivl = Math.max(min_ivl, elapsed_days + 1);
    }
    min_ivl = Math.min(min_ivl, max_ivl);
    return { min_ivl, max_ivl };
  }
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
  function roundTo(num, decimals) {
    const factor = 10 ** decimals;
    return Math.round(num * factor) / factor;
  }
  function dateDiffInDays(last, cur) {
    const utc1 = Date.UTC(
      last.getUTCFullYear(),
      last.getUTCMonth(),
      last.getUTCDate()
    );
    const utc2 = Date.UTC(
      cur.getUTCFullYear(),
      cur.getUTCMonth(),
      cur.getUTCDate()
    );
    return Math.floor(
      (utc2 - utc1) / 864e5
      /** 1000 * 60 * 60 * 24*/
    );
  }

  const ConvertStepUnitToMinutes = (step) => {
    const unit = step.slice(-1);
    const value = parseInt(step.slice(0, -1), 10);
    if (Number.isNaN(value) || !Number.isFinite(value) || value < 0) {
      throw new FSRSValidationError(`Invalid step value: ${step}`);
    }
    switch (unit) {
      case "m":
        return value;
      case "h":
        return value * 60;
      case "d":
        return value * 1440;
      default:
        throw new FSRSValidationError(
          `Invalid step unit: ${step}, expected m/h/d`
        );
    }
  };
  const BasicLearningStepsStrategy = (params, state, cur_step) => {
    const learning_steps = state === State.Relearning || state === State.Review ? params.relearning_steps : params.learning_steps;
    const steps_length = learning_steps.length;
    if (steps_length === 0 || cur_step >= steps_length) return {};
    const firstStep = learning_steps[0];
    const toMinutes = ConvertStepUnitToMinutes;
    const getAgainInterval = () => {
      return toMinutes(firstStep);
    };
    const getHardInterval = () => {
      if (steps_length === 1) return Math.round(toMinutes(firstStep) * 1.5);
      const nextStep = learning_steps[1];
      return Math.round((toMinutes(firstStep) + toMinutes(nextStep)) / 2);
    };
    const getStepInfo = (index) => {
      if (index < 0 || index >= steps_length) {
        return null;
      } else {
        return learning_steps[index];
      }
    };
    const getGoodMinutes = (step) => {
      return toMinutes(step);
    };
    const result = {};
    const step_info = getStepInfo(Math.max(0, cur_step));
    if (state === State.Review) {
      result[Rating.Again] = {
        scheduled_minutes: toMinutes(step_info),
        next_step: 0
      };
      return result;
    } else {
      result[Rating.Again] = {
        scheduled_minutes: getAgainInterval(),
        next_step: 0
      };
      result[Rating.Hard] = {
        scheduled_minutes: getHardInterval(),
        next_step: cur_step
      };
      const next_info = getStepInfo(cur_step + 1);
      if (next_info) {
        const nextMin = getGoodMinutes(next_info);
        if (nextMin) {
          result[Rating.Good] = {
            scheduled_minutes: Math.round(nextMin),
            next_step: cur_step + 1
          };
        }
      }
    }
    return result;
  };

  function DefaultInitSeedStrategy() {
    const time = this.review_time.getTime();
    const reps = this.current.reps;
    const mul = this.current.difficulty * this.current.stability;
    return `${time}_${reps}_${mul}`;
  }
  function GenSeedStrategyWithCardId(card_id_field) {
    return function() {
      var _a;
      const card_id = (_a = Reflect.get(this.current, card_id_field)) != null ? _a : 0;
      const reps = this.current.reps;
      return String(card_id + reps || 0);
    };
  }

  var StrategyMode = /* @__PURE__ */ ((StrategyMode2) => {
    StrategyMode2["SCHEDULER"] = "Scheduler";
    StrategyMode2["LEARNING_STEPS"] = "LearningSteps";
    StrategyMode2["SEED"] = "Seed";
    return StrategyMode2;
  })(StrategyMode || {});

  var __defProp$5 = Object.defineProperty;
  var __defNormalProp$5 = (obj, key, value) => key in obj ? __defProp$5(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField$5 = (obj, key, value) => __defNormalProp$5(obj, typeof key !== "symbol" ? key + "" : key, value);
  class AbstractScheduler {
    // init
    constructor(card, now, algorithm, strategies) {
      __publicField$5(this, "last");
      __publicField$5(this, "current");
      __publicField$5(this, "review_time");
      __publicField$5(this, "next", /* @__PURE__ */ new Map());
      __publicField$5(this, "algorithm");
      __publicField$5(this, "strategies");
      __publicField$5(this, "elapsed_days", 0);
      this.algorithm = algorithm;
      this.last = TypeConvert.card(card);
      this.current = TypeConvert.card(card);
      this.review_time = TypeConvert.time(now);
      this.strategies = strategies;
      this.init();
    }
    checkGrade(grade) {
      if (!Number.isFinite(grade) || grade < 1 || grade > 4) {
        throw new FSRSValidationError(`Invalid grade "${grade}",expected 1-4`);
      }
    }
    init() {
      const { state, last_review } = this.current;
      let interval = 0;
      if (state !== State.New && last_review) {
        interval = dateDiffInDays(last_review, this.review_time);
      }
      this.current.last_review = this.review_time;
      this.elapsed_days = interval;
      this.current.elapsed_days = interval;
      this.current.reps += 1;
      let seed_strategy = DefaultInitSeedStrategy;
      if (this.strategies) {
        const custom_strategy = this.strategies.get(StrategyMode.SEED);
        if (custom_strategy) {
          seed_strategy = custom_strategy;
        }
      }
      this.algorithm.seed = seed_strategy.call(this);
    }
    preview() {
      return {
        [Rating.Again]: this.review(Rating.Again),
        [Rating.Hard]: this.review(Rating.Hard),
        [Rating.Good]: this.review(Rating.Good),
        [Rating.Easy]: this.review(Rating.Easy),
        [Symbol.iterator]: this.previewIterator.bind(this)
      };
    }
    *previewIterator() {
      for (const grade of Grades) {
        yield this.review(grade);
      }
    }
    review(grade) {
      const { state } = this.last;
      let item;
      this.checkGrade(grade);
      switch (state) {
        case State.New:
          item = this.newState(grade);
          break;
        case State.Learning:
        case State.Relearning:
          item = this.learningState(grade);
          break;
        case State.Review:
          item = this.reviewState(grade);
          break;
      }
      return item;
    }
    buildLog(rating) {
      const { last_review, due, elapsed_days } = this.last;
      return {
        rating,
        state: this.current.state,
        due: last_review || due,
        stability: this.current.stability,
        difficulty: this.current.difficulty,
        elapsed_days: this.elapsed_days,
        last_elapsed_days: elapsed_days,
        scheduled_days: this.current.scheduled_days,
        learning_steps: this.current.learning_steps,
        review: this.review_time
      };
    }
  }

  var __defProp$4 = Object.defineProperty;
  var __defNormalProp$4 = (obj, key, value) => key in obj ? __defProp$4(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField$4 = (obj, key, value) => __defNormalProp$4(obj, typeof key !== "symbol" ? key + "" : key, value);
  class Alea {
    constructor(seed) {
      __publicField$4(this, "c");
      __publicField$4(this, "s0");
      __publicField$4(this, "s1");
      __publicField$4(this, "s2");
      const mash = Mash();
      this.c = 1;
      this.s0 = mash(" ");
      this.s1 = mash(" ");
      this.s2 = mash(" ");
      if (seed == null) seed = Date.now();
      this.s0 -= mash(seed);
      if (this.s0 < 0) this.s0 += 1;
      this.s1 -= mash(seed);
      if (this.s1 < 0) this.s1 += 1;
      this.s2 -= mash(seed);
      if (this.s2 < 0) this.s2 += 1;
    }
    next() {
      const t = 2091639 * this.s0 + this.c * 23283064365386963e-26;
      this.s0 = this.s1;
      this.s1 = this.s2;
      this.c = t | 0;
      this.s2 = t - this.c;
      return this.s2;
    }
    set state(state) {
      this.c = state.c;
      this.s0 = state.s0;
      this.s1 = state.s1;
      this.s2 = state.s2;
    }
    get state() {
      return {
        c: this.c,
        s0: this.s0,
        s1: this.s1,
        s2: this.s2
      };
    }
  }
  function Mash() {
    let n = 4022871197;
    return function mash(data) {
      data = String(data);
      for (let i = 0; i < data.length; i++) {
        n += data.charCodeAt(i);
        let h = 0.02519603282416938 * n;
        n = h >>> 0;
        h -= n;
        h *= n;
        n = h >>> 0;
        h -= n;
        n += h * 4294967296;
      }
      return (n >>> 0) * 23283064365386963e-26;
    };
  }
  function alea(seed) {
    const xg = new Alea(seed);
    const prng = () => xg.next();
    prng.int32 = () => xg.next() * 4294967296 | 0;
    prng.double = () => prng() + (prng() * 2097152 | 0) * 11102230246251565e-32;
    prng.state = () => xg.state;
    prng.importState = (state) => {
      xg.state = state;
      return prng;
    };
    return prng;
  }

  const version="5.4.2";

  const default_request_retention = 0.9;
  const default_maximum_interval = 36500;
  const default_enable_fuzz = false;
  const default_enable_short_term = true;
  const default_learning_steps = Object.freeze([
    "1m",
    "10m"
  ]);
  const default_relearning_steps = Object.freeze([
    "10m"
  ]);
  const FSRSVersion = `v${version} using FSRS-6.0`;
  const S_MIN = 1e-3;
  const S_MAX = 36500;
  const INIT_S_MAX = 100;
  const FSRS5_DEFAULT_DECAY = 0.5;
  const FSRS6_DEFAULT_DECAY = 0.1542;
  const default_w = Object.freeze([
    0.212,
    1.2931,
    2.3065,
    8.2956,
    6.4133,
    0.8334,
    3.0194,
    1e-3,
    1.8722,
    0.1666,
    0.796,
    1.4835,
    0.0614,
    0.2629,
    1.6483,
    0.6014,
    1.8729,
    0.5425,
    0.0912,
    0.0658,
    FSRS6_DEFAULT_DECAY
  ]);
  const W17_W18_Ceiling = 2;
  const CLAMP_PARAMETERS = (w17_w18_ceiling, enable_short_term = default_enable_short_term) => [
    [S_MIN, INIT_S_MAX],
    [S_MIN, INIT_S_MAX],
    [S_MIN, INIT_S_MAX],
    [S_MIN, INIT_S_MAX],
    [1, 10],
    [1e-3, 4],
    [1e-3, 4],
    [1e-3, 0.75],
    [0, 4.5],
    [0, 0.8],
    [1e-3, 3.5],
    [1e-3, 5],
    [1e-3, 0.25],
    [1e-3, 0.9],
    [0, 4],
    [0, 1],
    [1, 6],
    [0, w17_w18_ceiling],
    [0, w17_w18_ceiling],
    [
      enable_short_term ? 0.01 : 0,
      0.8
    ],
    [0.1, 0.8]
  ];

  const clipParameters = (parameters, numRelearningSteps, enableShortTerm = default_enable_short_term) => {
    const clip = CLAMP_PARAMETERS(W17_W18_Ceiling, enableShortTerm).slice(
      0,
      parameters.length
    );
    if (Math.max(0, numRelearningSteps) > 1) {
      const w11 = clamp(parameters[11] || 0, clip[11][0], clip[11][1]);
      const w13 = clamp(parameters[13] || 0, clip[13][0], clip[13][1]);
      const w14 = clamp(parameters[14] || 0, clip[14][0], clip[14][1]);
      const value = -(Math.log(w11) + Math.log(Math.pow(2, w13) - 1) + w14 * 0.3) / numRelearningSteps;
      const w17_w18_ceiling = clamp(
        roundTo(Math.sqrt(Math.max(value, 0)), 8),
        0.01,
        W17_W18_Ceiling
      );
      if (clip[17]) clip[17] = [clip[17][0], w17_w18_ceiling];
      if (clip[18]) clip[18] = [clip[18][0], w17_w18_ceiling];
    }
    return clip.map(
      ([min, max], index) => clamp(parameters[index] || 0, min, max)
    );
  };
  const checkParameters = (parameters) => {
    const invalid = parameters.find((param) => !Number.isFinite(param));
    if (invalid !== void 0) {
      throw new FSRSValidationError(
        `Non-finite or NaN value in parameters ${parameters}`
      );
    } else if (![17, 19, 21].includes(parameters.length)) {
      throw new FSRSValidationError(
        `Invalid parameter length: ${parameters.length}. Must be 17, 19 or 21 for FSRSv4, 5 and 6 respectively.`
      );
    }
    return parameters;
  };
  const migrateParameters = (parameters, numRelearningSteps = 0, enableShortTerm = default_enable_short_term) => {
    if (parameters === void 0) {
      return [...default_w];
    }
    switch (parameters.length) {
      case 21:
        return clipParameters(
          Array.from(parameters),
          numRelearningSteps,
          enableShortTerm
        );
      case 19:
        console.debug("[FSRS-6]auto fill w from 19 to 21 length");
        return clipParameters(
          Array.from(parameters),
          numRelearningSteps,
          enableShortTerm
        ).concat([0, FSRS5_DEFAULT_DECAY]);
      case 17: {
        const w = clipParameters(
          Array.from(parameters),
          numRelearningSteps,
          enableShortTerm
        );
        w[4] = +(w[5] * 2 + w[4]).toFixed(8);
        w[5] = +(Math.log(w[5] * 3 + 1) / 3).toFixed(8);
        w[6] = +(w[6] + 0.5).toFixed(8);
        console.debug("[FSRS-6]auto fill w from 17 to 21 length");
        return w.concat([0, 0, 0, FSRS5_DEFAULT_DECAY]);
      }
      default:
        console.warn("[FSRS]Invalid parameters length, using default parameters");
        return [...default_w];
    }
  };
  const generatorParameters = (props) => {
    var _a, _b;
    const learning_steps = Array.isArray(props == null ? void 0 : props.learning_steps) ? props.learning_steps : default_learning_steps;
    const relearning_steps = Array.isArray(props == null ? void 0 : props.relearning_steps) ? props.relearning_steps : default_relearning_steps;
    const enable_short_term = (_a = props == null ? void 0 : props.enable_short_term) != null ? _a : default_enable_short_term;
    const w = migrateParameters(
      props == null ? void 0 : props.w,
      relearning_steps.length,
      enable_short_term
    );
    return {
      request_retention: (props == null ? void 0 : props.request_retention) || default_request_retention,
      maximum_interval: (props == null ? void 0 : props.maximum_interval) || default_maximum_interval,
      w,
      enable_fuzz: (_b = props == null ? void 0 : props.enable_fuzz) != null ? _b : default_enable_fuzz,
      enable_short_term,
      learning_steps,
      relearning_steps
    };
  };
  function createEmptyCard(now, afterHandler) {
    const emptyCard = {
      due: now ? TypeConvert.time(now) : /* @__PURE__ */ new Date(),
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0,
      learning_steps: 0,
      state: State.New,
      last_review: void 0
    };
    if (afterHandler && typeof afterHandler === "function") {
      return afterHandler(emptyCard);
    } else {
      return emptyCard;
    }
  }

  var __defProp$3 = Object.defineProperty;
  var __defNormalProp$3 = (obj, key, value) => key in obj ? __defProp$3(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField$3 = (obj, key, value) => __defNormalProp$3(obj, typeof key !== "symbol" ? key + "" : key, value);
  const computeDecayFactor = (decayOrParams) => {
    const decay = typeof decayOrParams === "number" ? -decayOrParams : -decayOrParams[20];
    const factor = Math.exp(Math.pow(decay, -1) * Math.log(0.9)) - 1;
    return { decay, factor: roundTo(factor, 8) };
  };
  function forgetting_curve(decayOrParams, elapsed_days, stability) {
    const { decay, factor } = computeDecayFactor(decayOrParams);
    return roundTo(Math.pow(1 + factor * elapsed_days / stability, decay), 8);
  }
  class FSRSAlgorithm {
    constructor(params) {
      __publicField$3(this, "param");
      __publicField$3(this, "intervalModifier");
      __publicField$3(this, "_seed");
      __publicField$3(this, "prepare_parameters", (params) => {
        const generated = generatorParameters(params);
        generated.w = clipParameters(
          Array.from(generated.w),
          generated.relearning_steps.length,
          generated.enable_short_term
        );
        return generated;
      });
      /**
       * The formula used is :
       * $$R(t,S) = (1 + \text{FACTOR} \times \frac{t}{9 \cdot S})^{\text{DECAY}}$$
       * @param {number} elapsed_days t days since the last review
       * @param {number} stability Stability (interval when R=90%)
       * @return {number} r Retrievability (probability of recall)
       */
      __publicField$3(this, "forgetting_curve");
      this.param = new Proxy(
        this.prepare_parameters(params),
        this.params_handler_proxy()
      );
      this.intervalModifier = this.calculate_interval_modifier(
        this.param.request_retention
      );
      this.forgetting_curve = forgetting_curve.bind(this, this.param.w);
    }
    get interval_modifier() {
      return this.intervalModifier;
    }
    set seed(seed) {
      this._seed = seed;
    }
    /**
     * @see https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm#fsrs-5
     *
     * The formula used is: $$I(r,s) = (r^{\frac{1}{DECAY}} - 1) / FACTOR \times s$$
     * @param request_retention 0<request_retention<=1,Requested retention rate
     * @throws {Error} Requested retention rate should be in the range (0,1]
     */
    calculate_interval_modifier(request_retention) {
      if (request_retention <= 0 || request_retention > 1) {
        throw new FSRSValidationError(
          "Requested retention rate should be in the range (0,1]"
        );
      }
      const { decay, factor } = computeDecayFactor(this.param.w);
      return roundTo((Math.pow(request_retention, 1 / decay) - 1) / factor, 8);
    }
    /**
     * Get the parameters of the algorithm.
     */
    get parameters() {
      return this.param;
    }
    /**
     * Set the parameters of the algorithm.
     * @param params Partial<FSRSParameters>
     */
    set parameters(params) {
      this.update_parameters(params);
    }
    params_handler_proxy() {
      const _this = this;
      return {
        set: function(target, prop, value) {
          if (prop === "request_retention" && Number.isFinite(value)) {
            _this.intervalModifier = _this.calculate_interval_modifier(
              Number(value)
            );
          } else if (prop === "w") {
            value = migrateParameters(
              value,
              target.relearning_steps.length,
              target.enable_short_term
            );
            value = clipParameters(
              Array.from(value),
              target.relearning_steps.length,
              target.enable_short_term
            );
            _this.forgetting_curve = forgetting_curve.bind(this, value);
            _this.intervalModifier = _this.calculate_interval_modifier(
              Number(target.request_retention)
            );
          }
          Reflect.set(target, prop, value);
          return true;
        }
      };
    }
    update_parameters(params) {
      const _params = this.prepare_parameters(params);
      for (const key in _params) {
        const paramKey = key;
        this.param[paramKey] = _params[paramKey];
      }
    }
    /**
       * The formula used is :
       * $$ S_0(G) = w_{G-1}$$
       * $$S_0 = \max \lbrace S_0,0.1\rbrace $$

       * @param g Grade (rating at Anki) [1.again,2.hard,3.good,4.easy]
       * @return Stability (interval when R=90%)
       */
    init_stability(g) {
      return Math.max(this.param.w[g - 1], 0.1);
    }
    /**
     * The formula used is :
     * $$D_0(G) = w_4 - e^{(G-1) \cdot w_5} + 1 $$
     * $$D_0 = \min \lbrace \max \lbrace D_0(G),1 \rbrace,10 \rbrace$$
     * where the $$D_0(1)=w_4$$ when the first rating is good.
     *
     * @param {Grade} g Grade (rating at Anki) [1.again,2.hard,3.good,4.easy]
     * @return {number} Difficulty $$D \in [1,10]$$
     */
    init_difficulty(g) {
      const w = this.param.w;
      const d = w[4] - Math.exp((g - 1) * w[5]) + 1;
      return roundTo(d, 8);
    }
    /**
     * If fuzzing is disabled or ivl is less than 2.5, it returns the original interval.
     * @param {number} ivl - The interval to be fuzzed.
     * @param {number} elapsed_days t days since the last review
     * @return {number} - The fuzzed interval.
     **/
    apply_fuzz(ivl, elapsed_days) {
      if (!this.param.enable_fuzz || ivl < 2.5) return Math.round(ivl);
      const generator = alea(this._seed);
      const fuzz_factor = generator();
      const { min_ivl, max_ivl } = get_fuzz_range(
        ivl,
        elapsed_days,
        this.param.maximum_interval
      );
      return Math.floor(fuzz_factor * (max_ivl - min_ivl + 1) + min_ivl);
    }
    /**
     *   @see The formula used is : {@link FSRSAlgorithm.calculate_interval_modifier}
     *   @param {number} s - Stability (interval when R=90%)
     *   @param {number} elapsed_days t days since the last review
     */
    next_interval(s, elapsed_days) {
      const newInterval = Math.min(
        Math.max(1, Math.round(s * this.intervalModifier)),
        this.param.maximum_interval
      );
      return this.apply_fuzz(newInterval, elapsed_days);
    }
    /**
     * @see https://github.com/open-spaced-repetition/fsrs4anki/issues/697
     */
    linear_damping(delta_d, old_d) {
      return roundTo(delta_d * (10 - old_d) / 9, 8);
    }
    /**
     * The formula used is :
     * $$\text{delta}_d = -w_6 \cdot (g - 3)$$
     * $$\text{next}_d = D + \text{linear damping}(\text{delta}_d , D)$$
     * $$D^\prime(D,R) = w_7 \cdot D_0(4) +(1 - w_7) \cdot \text{next}_d$$
     * @param {number} d Difficulty $$D \in [1,10]$$
     * @param {Grade} g Grade (rating at Anki) [1.again,2.hard,3.good,4.easy]
     * @return {number} $$\text{next}_D$$
     */
    next_difficulty(d, g) {
      const delta_d = -this.param.w[6] * (g - 3);
      const next_d = d + this.linear_damping(delta_d, d);
      return clamp(
        this.mean_reversion(this.init_difficulty(Rating.Easy), next_d),
        1,
        10
      );
    }
    /**
     * The formula used is :
     * $$w_7 \cdot \text{init} +(1 - w_7) \cdot \text{current}$$
     * @param {number} init $$w_2 : D_0(3) = w_2 + (R-2) \cdot w_3= w_2$$
     * @param {number} current $$D - w_6 \cdot (R - 2)$$
     * @return {number} difficulty
     */
    mean_reversion(init, current) {
      const w = this.param.w;
      return roundTo(w[7] * init + (1 - w[7]) * current, 8);
    }
    /**
     * The formula used is :
     * $$S^\prime_r(D,S,R,G) = S\cdot(e^{w_8}\cdot (11-D)\cdot S^{-w_9}\cdot(e^{w_{10}\cdot(1-R)}-1)\cdot w_{15}(\text{if} G=2) \cdot w_{16}(\text{if} G=4)+1)$$
     * @param {number} d Difficulty D \in [1,10]
     * @param {number} s Stability (interval when R=90%)
     * @param {number} r Retrievability (probability of recall)
     * @param {Grade} g Grade (Rating[0.again,1.hard,2.good,3.easy])
     * @return {number} S^\prime_r new stability after recall
     */
    next_recall_stability(d, s, r, g) {
      const w = this.param.w;
      const hard_penalty = Rating.Hard === g ? w[15] : 1;
      const easy_bound = Rating.Easy === g ? w[16] : 1;
      return roundTo(
        clamp(
          s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp((1 - r) * w[10]) - 1) * hard_penalty * easy_bound),
          S_MIN,
          36500
        ),
        8
      );
    }
    /**
     * The formula used is :
     * $$S^\prime_f(D,S,R) = w_{11}\cdot D^{-w_{12}}\cdot ((S+1)^{w_{13}}-1) \cdot e^{w_{14}\cdot(1-R)}$$
     * enable_short_term = true : $$S^\prime_f \in \min \lbrace \max \lbrace S^\prime_f,0.01\rbrace, \frac{S}{e^{w_{17} \cdot w_{18}}} \rbrace$$
     * enable_short_term = false : $$S^\prime_f \in \min \lbrace \max \lbrace S^\prime_f,0.01\rbrace, S \rbrace$$
     * @param {number} d Difficulty D \in [1,10]
     * @param {number} s Stability (interval when R=90%)
     * @param {number} r Retrievability (probability of recall)
     * @return {number} S^\prime_f new stability after forgetting
     */
    next_forget_stability(d, s, r) {
      const w = this.param.w;
      return roundTo(
        clamp(
          w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]),
          S_MIN,
          36500
        ),
        8
      );
    }
    /**
     * The formula used is :
     * $$S^\prime_s(S,G) = S \cdot e^{w_{17} \cdot (G-3+w_{18})}$$
     * @param {number} s Stability (interval when R=90%)
     * @param {Grade} g Grade (Rating[0.again,1.hard,2.good,3.easy])
     */
    next_short_term_stability(s, g) {
      const w = this.param.w;
      const sinc = Math.pow(s, -w[19]) * Math.exp(w[17] * (g - 3 + w[18]));
      const maskedSinc = g >= Rating.Hard ? Math.max(sinc, 1) : sinc;
      return roundTo(clamp(s * maskedSinc, S_MIN, 36500), 8);
    }
    /**
     * Calculates the next state of memory based on the current state, time elapsed, and grade.
     *
     * @param memory_state - The current state of memory, which can be null.
     * @param t - The time elapsed since the last review.
     * @param {Rating} g Grade (Rating[0.Manual,1.Again,2.Hard,3.Good,4.Easy])
     * @param r - Optional retrievability value. If not provided, it will be calculated.
     * @returns The next state of memory with updated difficulty and stability.
     */
    next_state(memory_state, t, g, r) {
      const { difficulty: d, stability: s } = memory_state != null ? memory_state : {
        difficulty: 0,
        stability: 0
      };
      if (t < 0) {
        throw new FSRSValidationError(`Invalid delta_t "${t}"`);
      }
      if (g < 0 || g > 4) {
        throw new FSRSValidationError(`Invalid grade "${g}"`);
      }
      if (d === 0 && s === 0) {
        return {
          difficulty: clamp(this.init_difficulty(g), 1, 10),
          stability: this.init_stability(g)
        };
      }
      if (g === 0) {
        return {
          difficulty: d,
          stability: s
        };
      }
      if (d < 1 || s < S_MIN) {
        throw new FSRSValidationError(
          `Invalid memory state { difficulty: ${d}, stability: ${s} }`
        );
      }
      const w = this.param.w;
      r = typeof r === "number" ? r : this.forgetting_curve(t, s);
      let new_s;
      if (t === 0 && this.param.enable_short_term) {
        new_s = this.next_short_term_stability(s, g);
      } else if (g === 1) {
        const s_after_fail = this.next_forget_stability(d, s, r);
        let [w_17, w_18] = [0, 0];
        if (this.param.enable_short_term) {
          w_17 = w[17];
          w_18 = w[18];
        }
        const next_s_min = s / Math.exp(w_17 * w_18);
        new_s = clamp(roundTo(next_s_min, 8), S_MIN, s_after_fail);
      } else {
        new_s = this.next_recall_stability(d, s, r, g);
      }
      const new_d = this.next_difficulty(d, g);
      return { difficulty: new_d, stability: new_s };
    }
  }

  var __defProp$2 = Object.defineProperty;
  var __defNormalProp$2 = (obj, key, value) => key in obj ? __defProp$2(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField$2 = (obj, key, value) => __defNormalProp$2(obj, key + "" , value);
  class BasicScheduler extends AbstractScheduler {
    constructor(card, now, algorithm, strategies) {
      super(card, now, algorithm, strategies);
      __publicField$2(this, "learningStepsStrategy");
      let learningStepStrategy = BasicLearningStepsStrategy;
      if (this.strategies) {
        const custom_strategy = this.strategies.get(StrategyMode.LEARNING_STEPS);
        if (custom_strategy) {
          learningStepStrategy = custom_strategy;
        }
      }
      this.learningStepsStrategy = learningStepStrategy;
    }
    getLearningInfo(card, grade) {
      var _a, _b, _c, _d;
      const parameters = this.algorithm.parameters;
      card.learning_steps = card.learning_steps || 0;
      const steps_strategy = this.learningStepsStrategy(
        parameters,
        card.state,
        card.learning_steps
      );
      const scheduled_minutes = Math.max(
        0,
        (_b = (_a = steps_strategy[grade]) == null ? void 0 : _a.scheduled_minutes) != null ? _b : 0
      );
      const next_steps = Math.max(0, (_d = (_c = steps_strategy[grade]) == null ? void 0 : _c.next_step) != null ? _d : 0);
      return {
        scheduled_minutes,
        next_steps
      };
    }
    /**
     * @description This function applies the learning steps based on the current card's state and grade.
     */
    applyLearningSteps(nextCard, grade, to_state) {
      const { scheduled_minutes, next_steps } = this.getLearningInfo(
        this.current,
        grade
      );
      if (scheduled_minutes > 0 && scheduled_minutes < 1440) {
        nextCard.learning_steps = next_steps;
        nextCard.scheduled_days = 0;
        nextCard.state = to_state;
        nextCard.due = date_scheduler(
          this.review_time,
          Math.round(scheduled_minutes),
          false
          /** true:days false: minute */
        );
      } else {
        nextCard.state = State.Review;
        if (scheduled_minutes >= 1440) {
          nextCard.learning_steps = next_steps;
          nextCard.due = date_scheduler(
            this.review_time,
            Math.round(scheduled_minutes),
            false
            /** true:days false: minute */
          );
          nextCard.scheduled_days = Math.floor(scheduled_minutes / 1440);
        } else {
          nextCard.learning_steps = 0;
          const interval = this.algorithm.next_interval(
            nextCard.stability,
            this.elapsed_days
          );
          nextCard.scheduled_days = interval;
          nextCard.due = date_scheduler(this.review_time, interval, true);
        }
      }
    }
    newState(grade) {
      const exist = this.next.get(grade);
      if (exist) {
        return exist;
      }
      const next = this.next_ds(this.elapsed_days, grade);
      this.applyLearningSteps(next, grade, State.Learning);
      const item = {
        card: next,
        log: this.buildLog(grade)
      };
      this.next.set(grade, item);
      return item;
    }
    learningState(grade) {
      const exist = this.next.get(grade);
      if (exist) {
        return exist;
      }
      const next = this.next_ds(this.elapsed_days, grade);
      this.applyLearningSteps(
        next,
        grade,
        this.last.state
        /** Learning or Relearning */
      );
      const item = {
        card: next,
        log: this.buildLog(grade)
      };
      this.next.set(grade, item);
      return item;
    }
    reviewState(grade) {
      const exist = this.next.get(grade);
      if (exist) {
        return exist;
      }
      const interval = this.elapsed_days;
      const retrievability = this.algorithm.forgetting_curve(
        interval,
        this.current.stability
      );
      const next_again = this.next_ds(interval, Rating.Again, retrievability);
      const next_hard = this.next_ds(interval, Rating.Hard, retrievability);
      const next_good = this.next_ds(interval, Rating.Good, retrievability);
      const next_easy = this.next_ds(interval, Rating.Easy, retrievability);
      this.next_interval(next_hard, next_good, next_easy, interval);
      this.next_state(next_hard, next_good, next_easy);
      this.applyLearningSteps(next_again, Rating.Again, State.Relearning);
      next_again.lapses += 1;
      const item_again = {
        card: next_again,
        log: this.buildLog(Rating.Again)
      };
      const item_hard = {
        card: next_hard,
        log: super.buildLog(Rating.Hard)
      };
      const item_good = {
        card: next_good,
        log: super.buildLog(Rating.Good)
      };
      const item_easy = {
        card: next_easy,
        log: super.buildLog(Rating.Easy)
      };
      this.next.set(Rating.Again, item_again);
      this.next.set(Rating.Hard, item_hard);
      this.next.set(Rating.Good, item_good);
      this.next.set(Rating.Easy, item_easy);
      return this.next.get(grade);
    }
    /**
     * Review next_ds
     */
    next_ds(t, g, r) {
      const next_state = this.algorithm.next_state(
        {
          difficulty: this.current.difficulty,
          stability: this.current.stability
        },
        t,
        g,
        r
      );
      const card = TypeConvert.card(this.current);
      card.difficulty = next_state.difficulty;
      card.stability = next_state.stability;
      return card;
    }
    /**
     * Review next_interval
     */
    next_interval(next_hard, next_good, next_easy, interval) {
      let hard_interval, good_interval;
      hard_interval = this.algorithm.next_interval(next_hard.stability, interval);
      good_interval = this.algorithm.next_interval(next_good.stability, interval);
      hard_interval = Math.min(hard_interval, good_interval);
      good_interval = Math.max(good_interval, hard_interval + 1);
      const easy_interval = Math.max(
        this.algorithm.next_interval(next_easy.stability, interval),
        good_interval + 1
      );
      next_hard.scheduled_days = hard_interval;
      next_hard.due = date_scheduler(this.review_time, hard_interval, true);
      next_good.scheduled_days = good_interval;
      next_good.due = date_scheduler(this.review_time, good_interval, true);
      next_easy.scheduled_days = easy_interval;
      next_easy.due = date_scheduler(this.review_time, easy_interval, true);
    }
    /**
     * Review next_state
     */
    next_state(next_hard, next_good, next_easy) {
      next_hard.state = State.Review;
      next_hard.learning_steps = 0;
      next_good.state = State.Review;
      next_good.learning_steps = 0;
      next_easy.state = State.Review;
      next_easy.learning_steps = 0;
    }
  }

  class LongTermScheduler extends AbstractScheduler {
    newState(grade) {
      const exist = this.next.get(grade);
      if (exist) {
        return exist;
      }
      this.current.scheduled_days = 0;
      this.current.elapsed_days = 0;
      const first_interval = 0;
      const next_again = this.next_ds(first_interval, Rating.Again);
      const next_hard = this.next_ds(first_interval, Rating.Hard);
      const next_good = this.next_ds(first_interval, Rating.Good);
      const next_easy = this.next_ds(first_interval, Rating.Easy);
      this.next_interval(
        next_again,
        next_hard,
        next_good,
        next_easy,
        first_interval
      );
      this.next_state(next_again, next_hard, next_good, next_easy);
      this.update_next(next_again, next_hard, next_good, next_easy);
      return this.next.get(grade);
    }
    next_ds(t, g, r) {
      const next_state = this.algorithm.next_state(
        {
          difficulty: this.current.difficulty,
          stability: this.current.stability
        },
        t,
        g,
        r
      );
      const card = TypeConvert.card(this.current);
      card.difficulty = next_state.difficulty;
      card.stability = next_state.stability;
      return card;
    }
    /**
     * @see https://github.com/open-spaced-repetition/ts-fsrs/issues/98#issuecomment-2241923194
     */
    learningState(grade) {
      return this.reviewState(grade);
    }
    reviewState(grade) {
      const exist = this.next.get(grade);
      if (exist) {
        return exist;
      }
      const interval = this.elapsed_days;
      const retrievability = this.algorithm.forgetting_curve(
        interval,
        this.current.stability
      );
      const next_again = this.next_ds(interval, Rating.Again, retrievability);
      const next_hard = this.next_ds(interval, Rating.Hard, retrievability);
      const next_good = this.next_ds(interval, Rating.Good, retrievability);
      const next_easy = this.next_ds(interval, Rating.Easy, retrievability);
      this.next_interval(next_again, next_hard, next_good, next_easy, interval);
      this.next_state(next_again, next_hard, next_good, next_easy);
      next_again.lapses += 1;
      this.update_next(next_again, next_hard, next_good, next_easy);
      return this.next.get(grade);
    }
    /**
     * Review/New next_interval
     */
    next_interval(next_again, next_hard, next_good, next_easy, interval) {
      let again_interval, hard_interval, good_interval, easy_interval;
      again_interval = this.algorithm.next_interval(
        next_again.stability,
        interval
      );
      hard_interval = this.algorithm.next_interval(next_hard.stability, interval);
      good_interval = this.algorithm.next_interval(next_good.stability, interval);
      easy_interval = this.algorithm.next_interval(next_easy.stability, interval);
      again_interval = Math.min(again_interval, hard_interval);
      hard_interval = Math.max(hard_interval, again_interval + 1);
      good_interval = Math.max(good_interval, hard_interval + 1);
      easy_interval = Math.max(easy_interval, good_interval + 1);
      next_again.scheduled_days = again_interval;
      next_again.due = date_scheduler(this.review_time, again_interval, true);
      next_hard.scheduled_days = hard_interval;
      next_hard.due = date_scheduler(this.review_time, hard_interval, true);
      next_good.scheduled_days = good_interval;
      next_good.due = date_scheduler(this.review_time, good_interval, true);
      next_easy.scheduled_days = easy_interval;
      next_easy.due = date_scheduler(this.review_time, easy_interval, true);
    }
    /**
     * Review/New next_state
     */
    next_state(next_again, next_hard, next_good, next_easy) {
      next_again.state = State.Review;
      next_again.learning_steps = 0;
      next_hard.state = State.Review;
      next_hard.learning_steps = 0;
      next_good.state = State.Review;
      next_good.learning_steps = 0;
      next_easy.state = State.Review;
      next_easy.learning_steps = 0;
    }
    update_next(next_again, next_hard, next_good, next_easy) {
      const item_again = {
        card: next_again,
        log: this.buildLog(Rating.Again)
      };
      const item_hard = {
        card: next_hard,
        log: super.buildLog(Rating.Hard)
      };
      const item_good = {
        card: next_good,
        log: super.buildLog(Rating.Good)
      };
      const item_easy = {
        card: next_easy,
        log: super.buildLog(Rating.Easy)
      };
      this.next.set(Rating.Again, item_again);
      this.next.set(Rating.Hard, item_hard);
      this.next.set(Rating.Good, item_good);
      this.next.set(Rating.Easy, item_easy);
    }
  }

  var __defProp$1 = Object.defineProperty;
  var __defProps$1 = Object.defineProperties;
  var __getOwnPropDescs$1 = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols$1 = Object.getOwnPropertySymbols;
  var __hasOwnProp$1 = Object.prototype.hasOwnProperty;
  var __propIsEnum$1 = Object.prototype.propertyIsEnumerable;
  var __defNormalProp$1 = (obj, key, value) => key in obj ? __defProp$1(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues$1 = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp$1.call(b, prop))
        __defNormalProp$1(a, prop, b[prop]);
    if (__getOwnPropSymbols$1)
      for (var prop of __getOwnPropSymbols$1(b)) {
        if (__propIsEnum$1.call(b, prop))
          __defNormalProp$1(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps$1 = (a, b) => __defProps$1(a, __getOwnPropDescs$1(b));
  var __publicField$1 = (obj, key, value) => __defNormalProp$1(obj, key + "" , value);
  class Reschedule {
    /**
     * Creates an instance of the `Reschedule` class.
     * @param fsrs - An instance of the FSRS class used for scheduling.
     */
    constructor(fsrs) {
      __publicField$1(this, "fsrs");
      this.fsrs = fsrs;
    }
    /**
     * Replays a review for a card and determines the next review date based on the given rating.
     * @param card - The card being reviewed.
     * @param reviewed - The date the card was reviewed.
     * @param rating - The grade given to the card during the review.
     * @returns A `RecordLogItem` containing the updated card and review log.
     */
    replay(card, reviewed, rating) {
      return this.fsrs.next(card, reviewed, rating);
    }
    /**
     * Processes a manual review for a card, allowing for custom state, stability, difficulty, and due date.
     * @param card - The card being reviewed.
     * @param state - The state of the card after the review.
     * @param reviewed - The date the card was reviewed.
     * @param elapsed_days - The number of days since the last review.
     * @param stability - (Optional) The stability of the card.
     * @param difficulty - (Optional) The difficulty of the card.
     * @param due - (Optional) The due date for the next review.
     * @returns A `RecordLogItem` containing the updated card and review log.
     * @throws Will throw an error if the state or due date is not provided when required.
     */
    handleManualRating(card, state, reviewed, elapsed_days, stability, difficulty, due) {
      if (typeof state === "undefined") {
        throw new FSRSValidationError(
          "reschedule: state is required for manual rating"
        );
      }
      let log;
      let next_card;
      if (state === State.New) {
        log = {
          rating: Rating.Manual,
          state,
          due: due != null ? due : reviewed,
          stability: card.stability,
          difficulty: card.difficulty,
          elapsed_days,
          last_elapsed_days: card.elapsed_days,
          scheduled_days: card.scheduled_days,
          learning_steps: card.learning_steps,
          review: reviewed
        };
        next_card = createEmptyCard(reviewed);
        next_card.last_review = reviewed;
      } else {
        if (typeof due === "undefined") {
          throw new FSRSValidationError(
            "reschedule: due is required for manual rating"
          );
        }
        const scheduled_days = date_diff(due, reviewed, "days");
        log = {
          rating: Rating.Manual,
          state: card.state,
          due: card.last_review || card.due,
          stability: card.stability,
          difficulty: card.difficulty,
          elapsed_days,
          last_elapsed_days: card.elapsed_days,
          scheduled_days: card.scheduled_days,
          learning_steps: card.learning_steps,
          review: reviewed
        };
        next_card = __spreadProps$1(__spreadValues$1({}, card), {
          state,
          due,
          last_review: reviewed,
          stability: stability || card.stability,
          difficulty: difficulty || card.difficulty,
          elapsed_days,
          scheduled_days,
          reps: card.reps + 1
        });
      }
      return { card: next_card, log };
    }
    /**
     * Reschedules a card based on its review history.
     *
     * @param current_card - The card to be rescheduled.
     * @param reviews - An array of review history objects.
     * @returns An array of record log items representing the rescheduling process.
     */
    reschedule(current_card, reviews) {
      const collections = [];
      let cur_card = createEmptyCard(current_card.due);
      for (const review of reviews) {
        let item;
        review.review = TypeConvert.time(review.review);
        if (review.rating === Rating.Manual) {
          let interval = 0;
          if (cur_card.state !== State.New && cur_card.last_review) {
            interval = date_diff(review.review, cur_card.last_review, "days");
          }
          item = this.handleManualRating(
            cur_card,
            review.state,
            review.review,
            interval,
            review.stability,
            review.difficulty,
            review.due ? TypeConvert.time(review.due) : void 0
          );
        } else {
          item = this.replay(cur_card, review.review, review.rating);
        }
        collections.push(item);
        cur_card = item.card;
      }
      return collections;
    }
    calculateManualRecord(current_card, now, record_log_item, update_memory) {
      if (!record_log_item) {
        return null;
      }
      const { card: reschedule_card, log } = record_log_item;
      const cur_card = TypeConvert.card(current_card);
      if (cur_card.due.getTime() === reschedule_card.due.getTime()) {
        return null;
      }
      cur_card.scheduled_days = date_diff(
        reschedule_card.due,
        cur_card.due,
        "days"
      );
      return this.handleManualRating(
        cur_card,
        reschedule_card.state,
        TypeConvert.time(now),
        log.elapsed_days,
        update_memory ? reschedule_card.stability : void 0,
        update_memory ? reschedule_card.difficulty : void 0,
        reschedule_card.due
      );
    }
  }

  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  function applyAfterHandler(value, afterHandler) {
    return typeof afterHandler === "function" ? afterHandler(value) : value;
  }
  class FSRS extends FSRSAlgorithm {
    constructor(param) {
      super(param);
      __publicField(this, "strategyHandler", /* @__PURE__ */ new Map());
      __publicField(this, "Scheduler");
      const { enable_short_term } = this.parameters;
      this.Scheduler = enable_short_term ? BasicScheduler : LongTermScheduler;
    }
    params_handler_proxy() {
      const _this = this;
      return {
        set: function(target, prop, value) {
          if (prop === "request_retention" && Number.isFinite(value)) {
            _this.intervalModifier = _this.calculate_interval_modifier(
              Number(value)
            );
          } else if (prop === "enable_short_term") {
            _this.Scheduler = value === true ? BasicScheduler : LongTermScheduler;
          } else if (prop === "w") {
            value = migrateParameters(
              value,
              target.relearning_steps.length,
              target.enable_short_term
            );
            value = clipParameters(
              Array.from(value),
              target.relearning_steps.length,
              target.enable_short_term
            );
            _this.forgetting_curve = forgetting_curve.bind(this, value);
            _this.intervalModifier = _this.calculate_interval_modifier(
              Number(target.request_retention)
            );
          }
          Reflect.set(target, prop, value);
          return true;
        }
      };
    }
    useStrategy(mode, handler) {
      this.strategyHandler.set(mode, handler);
      return this;
    }
    clearStrategy(mode) {
      if (mode) {
        this.strategyHandler.delete(mode);
      } else {
        this.strategyHandler.clear();
      }
      return this;
    }
    getScheduler(card, now) {
      const schedulerStrategy = this.strategyHandler.get(
        StrategyMode.SCHEDULER
      );
      const Scheduler = schedulerStrategy || this.Scheduler;
      const instance = new Scheduler(card, now, this, this.strategyHandler);
      return instance;
    }
    /**
     * Display the collection of cards and logs for the four scenarios after scheduling the card at the current time.
     * @param card Card to be processed
     * @param now Current time or scheduled time
     * @param afterHandler Convert the result to another type. (Optional)
     * @example
     * ```typescript
     * const card: Card = createEmptyCard(new Date());
     * const f = fsrs();
     * const recordLog = f.repeat(card, new Date());
     * ```
     * @example
     * ```typescript
     * interface RevLogUnchecked
     *   extends Omit<ReviewLog, "due" | "review" | "state" | "rating"> {
     *   cid: string;
     *   due: Date | number;
     *   state: StateType;
     *   review: Date | number;
     *   rating: RatingType;
     * }
     *
     * interface RepeatRecordLog {
     *   card: CardUnChecked; //see method: createEmptyCard
     *   log: RevLogUnchecked;
     * }
     *
     * function repeatAfterHandler(recordLog: RecordLog) {
     *     const record: { [key in Grade]: RepeatRecordLog } = {} as {
     *       [key in Grade]: RepeatRecordLog;
     *     };
     *     for (const grade of Grades) {
     *       record[grade] = {
     *         card: {
     *           ...(recordLog[grade].card as Card & { cid: string }),
     *           due: recordLog[grade].card.due.getTime(),
     *           state: State[recordLog[grade].card.state] as StateType,
     *           last_review: recordLog[grade].card.last_review
     *             ? recordLog[grade].card.last_review!.getTime()
     *             : null,
     *         },
     *         log: {
     *           ...recordLog[grade].log,
     *           cid: (recordLog[grade].card as Card & { cid: string }).cid,
     *           due: recordLog[grade].log.due.getTime(),
     *           review: recordLog[grade].log.review.getTime(),
     *           state: State[recordLog[grade].log.state] as StateType,
     *           rating: Rating[recordLog[grade].log.rating] as RatingType,
     *         },
     *       };
     *     }
     *     return record;
     * }
     * const card: Card = createEmptyCard(new Date(), cardAfterHandler); //see method:  createEmptyCard
     * const f = fsrs();
     * const recordLog = f.repeat(card, new Date(), repeatAfterHandler);
     * ```
     */
    repeat(card, now, afterHandler) {
      const instance = this.getScheduler(card, now);
      const recordLog = instance.preview();
      return applyAfterHandler(recordLog, afterHandler);
    }
    /**
     * Display the collection of cards and logs for the card scheduled at the current time, after applying a specific grade rating.
     * @param card Card to be processed
     * @param now Current time or scheduled time
     * @param grade Rating of the review (Again, Hard, Good, Easy)
     * @param afterHandler Convert the result to another type. (Optional)
     * @example
     * ```typescript
     * const card: Card = createEmptyCard(new Date());
     * const f = fsrs();
     * const recordLogItem = f.next(card, new Date(), Rating.Again);
     * ```
     * @example
     * ```typescript
     * interface RevLogUnchecked
     *   extends Omit<ReviewLog, "due" | "review" | "state" | "rating"> {
     *   cid: string;
     *   due: Date | number;
     *   state: StateType;
     *   review: Date | number;
     *   rating: RatingType;
     * }
     *
     * interface NextRecordLog {
     *   card: CardUnChecked; //see method: createEmptyCard
     *   log: RevLogUnchecked;
     * }
     *
    function nextAfterHandler(recordLogItem: RecordLogItem) {
      const recordItem = {
        card: {
          ...(recordLogItem.card as Card & { cid: string }),
          due: recordLogItem.card.due.getTime(),
          state: State[recordLogItem.card.state] as StateType,
          last_review: recordLogItem.card.last_review
            ? recordLogItem.card.last_review!.getTime()
            : null,
        },
        log: {
          ...recordLogItem.log,
          cid: (recordLogItem.card as Card & { cid: string }).cid,
          due: recordLogItem.log.due.getTime(),
          review: recordLogItem.log.review.getTime(),
          state: State[recordLogItem.log.state] as StateType,
          rating: Rating[recordLogItem.log.rating] as RatingType,
        },
      };
      return recordItem
    }
     * const card: Card = createEmptyCard(new Date(), cardAfterHandler); //see method:  createEmptyCard
     * const f = fsrs();
     * const recordLogItem = f.repeat(card, new Date(), Rating.Again, nextAfterHandler);
     * ```
     */
    next(card, now, grade, afterHandler) {
      const instance = this.getScheduler(card, now);
      const g = TypeConvert.rating(grade);
      if (g === Rating.Manual) {
        throw new FSRSValidationError("Cannot review a manual rating");
      }
      const recordLogItem = instance.review(g);
      return applyAfterHandler(recordLogItem, afterHandler);
    }
    /**
     * Get the retrievability of the card
     * @param card  Card to be processed
     * @param now  Current time or scheduled time
     * @param format  default:true , Convert the result to another type. (Optional)
     * @returns  The retrievability of the card,if format is true, the result is a string, otherwise it is a number
     */
    get_retrievability(card, now, format = true) {
      const processedCard = TypeConvert.card(card);
      now = now ? TypeConvert.time(now) : /* @__PURE__ */ new Date();
      const t = processedCard.state !== State.New ? Math.max(date_diff(now, processedCard.last_review, "days"), 0) : 0;
      const r = processedCard.state !== State.New ? this.forgetting_curve(t, +processedCard.stability.toFixed(8)) : 0;
      return format ? `${(r * 100).toFixed(2)}%` : r;
    }
    /**
     *
     * @param card Card to be processed
     * @param log last review log
     * @param afterHandler Convert the result to another type. (Optional)
     * @example
     * ```typescript
     * const now = new Date();
     * const f = fsrs();
     * const emptyCardFormAfterHandler = createEmptyCard(now);
     * const repeatFormAfterHandler = f.repeat(emptyCardFormAfterHandler, now);
     * const { card, log } = repeatFormAfterHandler[Rating.Hard];
     * const rollbackFromAfterHandler = f.rollback(card, log);
     * ```
     *
     * @example
     * ```typescript
     * const now = new Date();
     * const f = fsrs();
     * const emptyCardFormAfterHandler = createEmptyCard(now, cardAfterHandler);  //see method: createEmptyCard
     * const repeatFormAfterHandler = f.repeat(emptyCardFormAfterHandler, now, repeatAfterHandler); //see method: fsrs.repeat()
     * const { card, log } = repeatFormAfterHandler[Rating.Hard];
     * const rollbackFromAfterHandler = f.rollback(card, log, cardAfterHandler);
     * ```
     */
    rollback(card, log, afterHandler) {
      const processedCard = TypeConvert.card(card);
      const processedLog = TypeConvert.review_log(log);
      if (processedLog.rating === Rating.Manual) {
        throw new FSRSValidationError("Cannot rollback a manual rating");
      }
      let last_due;
      let last_review;
      let last_lapses;
      switch (processedLog.state) {
        case State.New:
          last_due = processedLog.due;
          last_review = void 0;
          last_lapses = 0;
          break;
        case State.Learning:
        case State.Relearning:
        case State.Review:
          last_due = processedLog.review;
          last_review = processedLog.due;
          last_lapses = processedCard.lapses - (processedLog.rating === Rating.Again && processedLog.state === State.Review ? 1 : 0);
          break;
      }
      const prevCard = __spreadProps(__spreadValues({}, processedCard), {
        due: last_due,
        stability: processedLog.stability,
        difficulty: processedLog.difficulty,
        elapsed_days: processedLog.last_elapsed_days,
        scheduled_days: processedLog.scheduled_days,
        reps: Math.max(0, processedCard.reps - 1),
        lapses: Math.max(0, last_lapses),
        learning_steps: processedLog.learning_steps,
        state: processedLog.state,
        last_review
      });
      return applyAfterHandler(prevCard, afterHandler);
    }
    /**
     *
     * @param card Card to be processed
     * @param now Current time or scheduled time
     * @param reset_count Should the review count information(reps,lapses) be reset. (Optional)
     * @param afterHandler Convert the result to another type. (Optional)
     * @example
     * ```typescript
     * const now = new Date();
     * const f = fsrs();
     * const emptyCard = createEmptyCard(now);
     * const scheduling_cards = f.repeat(emptyCard, now);
     * const { card, log } = scheduling_cards[Rating.Hard];
     * const forgetCard = f.forget(card, new Date(), true);
     * ```
     *
     * @example
     * ```typescript
     * interface RepeatRecordLog {
     *   card: CardUnChecked; //see method: createEmptyCard
     *   log: RevLogUnchecked; //see method: fsrs.repeat()
     * }
     *
     * function forgetAfterHandler(recordLogItem: RecordLogItem): RepeatRecordLog {
     *     return {
     *       card: {
     *         ...(recordLogItem.card as Card & { cid: string }),
     *         due: recordLogItem.card.due.getTime(),
     *         state: State[recordLogItem.card.state] as StateType,
     *         last_review: recordLogItem.card.last_review
     *           ? recordLogItem.card.last_review!.getTime()
     *           : null,
     *       },
     *       log: {
     *         ...recordLogItem.log,
     *         cid: (recordLogItem.card as Card & { cid: string }).cid,
     *         due: recordLogItem.log.due.getTime(),
     *         review: recordLogItem.log.review.getTime(),
     *         state: State[recordLogItem.log.state] as StateType,
     *         rating: Rating[recordLogItem.log.rating] as RatingType,
     *       },
     *     };
     * }
     * const now = new Date();
     * const f = fsrs();
     * const emptyCardFormAfterHandler = createEmptyCard(now, cardAfterHandler); //see method:  createEmptyCard
     * const repeatFormAfterHandler = f.repeat(emptyCardFormAfterHandler, now, repeatAfterHandler); //see method: fsrs.repeat()
     * const { card } = repeatFormAfterHandler[Rating.Hard];
     * const forgetFromAfterHandler = f.forget(card, date_scheduler(now, 1, true), false, forgetAfterHandler);
     * ```
     */
    forget(card, now, reset_count = false, afterHandler) {
      const processedCard = TypeConvert.card(card);
      now = TypeConvert.time(now);
      const scheduled_days = processedCard.state === State.New ? 0 : date_diff(now, processedCard.due, "days");
      const forget_log = {
        rating: Rating.Manual,
        state: processedCard.state,
        due: processedCard.due,
        stability: processedCard.stability,
        difficulty: processedCard.difficulty,
        elapsed_days: 0,
        last_elapsed_days: processedCard.elapsed_days,
        scheduled_days,
        learning_steps: processedCard.learning_steps,
        review: now
      };
      const forget_card = __spreadProps(__spreadValues({}, processedCard), {
        due: now,
        stability: 0,
        difficulty: 0,
        elapsed_days: 0,
        scheduled_days: 0,
        reps: reset_count ? 0 : processedCard.reps,
        lapses: reset_count ? 0 : processedCard.lapses,
        learning_steps: 0,
        state: State.New,
        last_review: processedCard.last_review
      });
      const recordLogItem = { card: forget_card, log: forget_log };
      return applyAfterHandler(recordLogItem, afterHandler);
    }
    /**
     * Reschedules the current card and returns the rescheduled collections and reschedule item.
     *
     * @template T - The type of the record log item.
     * @param {CardInput | Card} current_card - The current card to be rescheduled.
     * @param {Array<FSRSHistory>} reviews - The array of FSRSHistory objects representing the reviews.
     * @param {Partial<RescheduleOptions<T>>} options - The optional reschedule options.
     * @returns {IReschedule<T>} - The rescheduled collections and reschedule item.
     *
     * @example
     * ```typescript
     * const f = fsrs()
     * const grades: Grade[] = [Rating.Good, Rating.Good, Rating.Good, Rating.Good]
     * const reviews_at = [
     *   new Date(2024, 8, 13),
     *   new Date(2024, 8, 13),
     *   new Date(2024, 8, 17),
     *   new Date(2024, 8, 28),
     * ]
     *
     * const reviews: FSRSHistory[] = []
     * for (let i = 0; i < grades.length; i++) {
     *   reviews.push({
     *     rating: grades[i],
     *     review: reviews_at[i],
     *   })
     * }
     *
     * const results_short = scheduler.reschedule(
     *   createEmptyCard(),
     *   reviews,
     *   {
     *     skipManual: false,
     *   }
     * )
     * console.log(results_short)
     * ```
     */
    reschedule(current_card, reviews = [], options = {}) {
      const {
        recordLogHandler,
        reviewsOrderBy,
        skipManual = true,
        now = /* @__PURE__ */ new Date(),
        update_memory_state: updateMemoryState = false
      } = options;
      if (reviewsOrderBy && typeof reviewsOrderBy === "function") {
        reviews.sort(reviewsOrderBy);
      }
      if (skipManual) {
        reviews = reviews.filter((review) => review.rating !== Rating.Manual);
      }
      const rescheduleSvc = new Reschedule(this);
      const collections = rescheduleSvc.reschedule(
        options.first_card || createEmptyCard(),
        reviews
      );
      const len = collections.length;
      const cur_card = TypeConvert.card(current_card);
      const manual_item = rescheduleSvc.calculateManualRecord(
        cur_card,
        now,
        len ? collections[len - 1] : void 0,
        updateMemoryState
      );
      return {
        collections: typeof recordLogHandler === "function" ? collections.map(recordLogHandler) : collections,
        reschedule_item: manual_item ? applyAfterHandler(manual_item, recordLogHandler) : null
      };
    }
  }
  const fsrs = (params) => {
    return new FSRS(params || {});
  };

  exports.AbstractScheduler = AbstractScheduler;
  exports.BasicLearningStepsStrategy = BasicLearningStepsStrategy;
  exports.CLAMP_PARAMETERS = CLAMP_PARAMETERS;
  exports.ConvertStepUnitToMinutes = ConvertStepUnitToMinutes;
  exports.DefaultInitSeedStrategy = DefaultInitSeedStrategy;
  exports.FSRS = FSRS;
  exports.FSRS5_DEFAULT_DECAY = FSRS5_DEFAULT_DECAY;
  exports.FSRS6_DEFAULT_DECAY = FSRS6_DEFAULT_DECAY;
  exports.FSRSAlgorithm = FSRSAlgorithm;
  exports.FSRSVersion = FSRSVersion;
  exports.GenSeedStrategyWithCardId = GenSeedStrategyWithCardId;
  exports.Grades = Grades;
  exports.INIT_S_MAX = INIT_S_MAX;
  exports.Rating = Rating;
  exports.S_MAX = S_MAX;
  exports.S_MIN = S_MIN;
  exports.State = State;
  exports.StrategyMode = StrategyMode;
  exports.TypeConvert = TypeConvert;
  exports.W17_W18_Ceiling = W17_W18_Ceiling;
  exports.checkParameters = checkParameters;
  exports.clamp = clamp;
  exports.clipParameters = clipParameters;
  exports.computeDecayFactor = computeDecayFactor;
  exports.createEmptyCard = createEmptyCard;
  exports.dateDiffInDays = dateDiffInDays;
  exports.date_diff = date_diff;
  exports.date_scheduler = date_scheduler;
  exports.default_enable_fuzz = default_enable_fuzz;
  exports.default_enable_short_term = default_enable_short_term;
  exports.default_learning_steps = default_learning_steps;
  exports.default_maximum_interval = default_maximum_interval;
  exports.default_relearning_steps = default_relearning_steps;
  exports.default_request_retention = default_request_retention;
  exports.default_w = default_w;
  exports.fixDate = fixDate;
  exports.fixRating = fixRating;
  exports.fixState = fixState;
  exports.forgetting_curve = forgetting_curve;
  exports.formatDate = formatDate;
  exports.fsrs = fsrs;
  exports.generatorParameters = generatorParameters;
  exports.get_fuzz_range = get_fuzz_range;
  exports.migrateParameters = migrateParameters;
  exports.roundTo = roundTo;
  exports.show_diff_message = show_diff_message;

}));
//# sourceMappingURL=index.umd.js.map
    // END VENDORED TS-FSRS 5.4.2
    return module.exports;
    })();
  }
  const DAY = 86400000;
  const PREFIX = 'lexi:v1:';
  const MAX_REVIEW_DAYS = 365;
  const RETENTIONS = [0.85, 0.88, 0.9, 0.92, 0.95];
  const schedulers = new Map();
  const schedulerFor = (retention = 0.9) => {
    if (!RETENTIONS.includes(retention)) retention = 0.9;
    if (!schedulers.has(retention)) schedulers.set(retention, memory.fsrs({
      request_retention: retention, maximum_interval: MAX_REVIEW_DAYS, enable_fuzz: false,
      learning_steps: ['1m', '10m'], relearning_steps: ['10m']
    }));
    return schedulers.get(retention);
  };
  const GRADES = { again: 1, hard: 2, good: 3, easy: 4 };
  const STUDY_STATES = ['新词', '学习中', '间隔复习', '重新学习'];
  const DEFAULTS = { auto: true, autoBook: false, context: false, readingMarkerSeconds: 3, newPerDay: 20, retention: 0.9, reverse: false, reviewCacheOnly: false, translationFallback: 'google', phoneticFallback: 'datamuse' };
  const cleanSettings = raw => {
    const value = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
    if (!Number.isInteger(value.readingMarkerSeconds) || value.readingMarkerSeconds < 0 || value.readingMarkerSeconds > 300) value.readingMarkerSeconds = DEFAULTS.readingMarkerSeconds;
    if (!Number.isInteger(value.newPerDay) || value.newPerDay < 0 || value.newPerDay > 200) value.newPerDay = DEFAULTS.newPerDay;
    if (!RETENTIONS.includes(value.retention)) value.retention = DEFAULTS.retention;
    if (typeof value.reviewCacheOnly !== 'boolean') value.reviewCacheOnly = DEFAULTS.reviewCacheOnly;
    if (!['none', 'google'].includes(value.translationFallback)) value.translationFallback = DEFAULTS.translationFallback;
    if (!['none', 'datamuse'].includes(value.phoneticFallback)) value.phoneticFallback = DEFAULTS.phoneticFallback;
    return value;
  };
  function pageScope(value) {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('网页范围必须是无账号信息的 HTTP / HTTPS 地址');
    }
    const route = /^#!?\//.test(url.hash) ? url.hash.split('?')[0] : '';
    return { page: url.origin + url.pathname + route, domain: url.hostname };
  }
  function validateSiteRules(raw) {
    if (!Array.isArray(raw) || raw.length > 10000) throw new Error('网页禁用规则格式无效或超过 10,000 条');
    const seen = new Set();
    return raw.map(item => {
      if (!item || !['page', 'domain'].includes(item.type) || typeof item.value !== 'string' ||
        !item.value || item.value.length > 4096) throw new Error('网页禁用规则格式无效');
      const normalized = item.type === 'page' ? pageScope(item.value).page : pageScope('https://' + item.value).domain;
      if (normalized !== item.value || (item.type === 'domain' && item.value !== new URL('https://' + item.value).host)) {
        throw new Error('网页禁用规则地址无效');
      }
      const key = item.type + ':' + normalized;
      if (seen.has(key)) throw new Error('网页禁用规则重复');
      seen.add(key);
      return { type: item.type, value: normalized };
    });
  }
  function siteState(address, rules) {
    const scope = pageScope(address);
    const pageDisabled = rules.some(rule => rule.type === 'page' && rule.value === scope.page);
    const domainDisabled = rules.some(rule => rule.type === 'domain' && rule.value === scope.domain);
    return { ...scope, pageDisabled, domainDisabled, disabled: pageDisabled || domainDisabled };
  }
  const normalize = value => {
    if (typeof value !== 'string') return '';
    const word = value.trim().replace(/[‘’]/g, "'")
      .replace(/^[\s'"“”([{]+|[\s'"“”.,!?;:)\]}]+$/g, '').toLowerCase();
    return word.length <= 64 && /^[a-z]+(?:[-'][a-z]+)*$/.test(word) ? word : '';
  };
  const MAX_SENTENCE_LENGTH = 5000;
  function classifyQuery(value) {
    const word = normalize(value);
    if (word) return { type: 'word', value: word };
    if (typeof value !== 'string') return null;
    const sentence = value.trim();
    const words = /(?:^|[^a-z0-9_'’-])[a-z]+(?:[-'’][a-z]+)*(?=$|[^a-z0-9_'’-])/gi;
    return words.exec(sentence) && words.exec(sentence) ? { type: 'sentence', value: sentence } : null;
  }
  const text = (value, max = 1200) => typeof value === 'string' ? value.slice(0, max) : '';
  const safeUrl = value => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  };
  const audioUrl = value => {
    const url = safeUrl(typeof value === 'string' && value.startsWith('//') ? 'https:' + value : value);
    if (!url) return '';
    const host = new URL(url).hostname;
    return host === 'api.dictionaryapi.dev' || host === 'gstatic.com' || host.endsWith('.gstatic.com') ? url : '';
  };
  function memoryCard(record) {
    if (record.fsrs) return memory.TypeConvert.card(record.fsrs);
    const card = memory.createEmptyCard(record.addedAt);
    card.due = new Date(record.dueAt);
    if (record.reviews) {
      // shortcut: 旧版没有逐次反馈日志，以旧间隔估计稳定性，今后的真实反馈继续校准。
      const oldInterval = record.lastReviewedAt ? (record.dueAt - record.lastReviewedAt) / DAY
        : [1, 1, 3, 7, 14, 30, 60][record.stage];
      Object.assign(card, {
        stability: Math.max(0.1, Math.min(36500, oldInterval)), difficulty: 5,
        scheduled_days: Math.max(0, Math.min(36500, Math.round(oldInterval))), reps: record.reviews,
        state: record.lastGrade === 'again' ? memory.State.Relearning : memory.State.Review,
        last_review: new Date(record.lastReviewedAt || record.addedAt)
      });
    }
    return card;
  }
  const storedCard = card => ({
    ...card, due: card.due.getTime(),
    ...(card.last_review ? { last_review: card.last_review.getTime() } : {})
  });
  const migrateStudy = record => ({ ...record, fsrs: storedCard(memoryCard(record)) });
  const createStudy = (word, now = Date.now()) => migrateStudy({
    word, addedAt: now, updatedAt: now,
    stage: 0, dueAt: now, reviews: 0, lastReviewedAt: 0, lastGrade: ''
  });
  function reviewTime(now) {
    if (!Number.isSafeInteger(now) || now <= 0 || now > 8640000000000000) throw new Error('复习时间无效');
  }
  // 上游按 UTC 日历日计算间隔天数；平移到“本地凌晨 4:00 为日界”的时钟后再交给 FSRS，
  // 使提前到 4:00 复习的卡片按学习日计算已过天数。
  const learningClock = time => time - new Date(time).getTimezoneOffset() * 60000 - DAY_START_HOUR * 3600000;
  function fsrsInput(record, now) {
    const prior = memoryCard(record);
    const card = { ...prior, due: new Date(learningClock(prior.due.getTime())) };
    if (prior.last_review) card.last_review = new Date(learningClock(prior.last_review.getTime()));
    return { prior, card, at: learningClock(now) };
  }
  function finish(record, grade, card, prior, now, at) {
    if (card.state === memory.State.Review) {
      // 保留本地钟点，但按日历推进，防止切换夏令时后落到 4:00 的另一侧。
      card.scheduled_days = Math.min(card.scheduled_days, MAX_REVIEW_DAYS);
      const dueDay = shiftLearningDay(now, card.scheduled_days);
      const due = new Date(now);
      due.setDate(due.getDate() + card.scheduled_days);
      card.due = dayStart(due.getTime()) === dueDay ? due : new Date(dueDay);
    } else {
      card.due = new Date(now + card.due.getTime() - at);
    }
    if (card.last_review) card.last_review = new Date(now);
    const stage = grade === 'again' ? 0 : grade === 'hard' ? record.stage : Math.min(record.stage + 1, 6);
    return {
      ...record, stage, fsrs: storedCard(card), dueAt: card.due.getTime(), updatedAt: now,
      lastReviewedAt: now, reviews: card.reps, lastGrade: grade,
      log: [...(record.log || []), { at: now, rating: GRADES[grade], state: prior.state }]
    };
  }
  function schedule(record, grade, now, retention) {
    if (!Object.hasOwn(GRADES, grade)) throw new Error('未知复习反馈');
    reviewTime(now);
    const { prior, card, at } = fsrsInput(record, now);
    return finish(record, grade, schedulerFor(retention).next(card, at, GRADES[grade]).card, prior, now, at);
  }
  function scheduleAll(record, now, retention) {
    reviewTime(now);
    const { prior, card, at } = fsrsInput(record, now);
    const preview = schedulerFor(retention).repeat(card, at);
    return Object.fromEntries(Object.entries(GRADES).map(([grade, rating]) =>
      [grade, finish(record, grade, preview[rating].card, prior, now, at)]));
  }
  const retrievability = (record, now, retention) => {
    const { card, at } = fsrsInput(record, now);
    return schedulerFor(retention).get_retrievability(card, at, false);
  };
  const reviewInterval = delay => delay < DAY ? `${Math.max(1, Math.ceil(delay / 60000))} 分钟`
    : `${Math.round(delay / DAY)} 天`;
  const LEARN_AHEAD = 20 * 60000;
  const DAY_START_HOUR = 4;
  const ROUND_SIZE = 20;
  const LEECH_LAPSES = 8;
  function dayStart(now) {
    const day = new Date(now);
    if (day.getHours() < DAY_START_HOUR) day.setDate(day.getDate() - 1);
    day.setHours(DAY_START_HOUR, 0, 0, 0);
    return day.getTime();
  }
  function shiftLearningDay(now, days) {
    const day = new Date(dayStart(now));
    day.setDate(day.getDate() + days);
    day.setHours(DAY_START_HOUR, 0, 0, 0);
    return day.getTime();
  }
  const nextDayStart = now => shiftLearningDay(now, 1);
  const stateOf = record => record.fsrs ? record.fsrs.state : memoryCard(record).state;
  // 长期复习卡按学习日到期；学习／重学卡仍按精确时间。
  const availableAt = record => stateOf(record) === memory.State.Review ? dayStart(record.dueAt) : record.dueAt;
  const isLeech = record => (record.fsrs?.lapses || 0) >= LEECH_LAPSES;
  function shuffleKey(value) {
    let hash = 2166136261;
    for (const char of value) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
    return hash >>> 0;
  }
  function newCardSlots(records, now, limit) {
    const start = dayStart(now);
    const used = records.filter(record => record.log?.[0]?.state === memory.State.New &&
      record.log[0].at >= start && record.log[0].at <= now).length;
    return Math.max(0, limit - used);
  }
  // cards 用于出题，progress 可包含暂停出题但仍占用额度的卡。
  function planReview(cards, now, { newPerDay = 20, retention, size = ROUND_SIZE } = {}, progress = cards.map(card => card.record)) {
    const start = dayStart(now);
    const end = nextDayStart(now);
    const items = cards.map(card => {
      const state = stateOf(card.record);
      const buried = state !== 1 && state !== 3 && card.sibling?.lastReviewedAt >= start;
      const at = buried ? Math.max(availableAt(card.record), end) : availableAt(card.record);
      return { ...card, state, buried, at };
    });
    const learning = items.filter(item => (item.state === 1 || item.state === 3) && item.record.dueAt <= now)
      .sort((a, b) => a.record.dueAt - b.record.dueAt);
    const reviews = items.filter(item => item.state === 2 && item.at <= now);
    const backlog = reviews.length > size;
    for (const item of reviews) item.rank = backlog ? retrievability(item.record, now, retention) : item.at;
    reviews.sort((a, b) => a.rank - b.rank || shuffleKey(start + a.kind + a.word) - shuffleKey(start + b.kind + b.word));
    const fresh = items.filter(item => item.state === 0 && !item.buried).sort((a, b) =>
      (a.order ?? a.record.addedAt) - (b.order ?? b.record.addedAt) || a.word.localeCompare(b.word));
    const newLeft = newCardSlots(progress, now, newPerDay);
    const round = [];
    const words = new Set();
    for (const item of [...learning, ...reviews, ...fresh.slice(0, newLeft)]) {
      if (round.length >= size) break;
      if (words.has(item.word)) continue;
      words.add(item.word);
      round.push(item);
    }
    const upcoming = items.filter(item => item.state !== 0 && item.at > now)
      .sort((a, b) => a.at - b.at || a.word.localeCompare(b.word));
    return { learning, reviews, fresh, newLeft, newToday: Math.min(fresh.length, newLeft), round, upcoming, backlog, start, end };
  }
  const ANSWER_LIMIT = 10 * 60000;
  const cardKey = ({ kind, word }) => (kind === 'recall' ? 'recall:' : 'study:') + word;
  const entryOf = ({ kind, word, record, virtual = false }) => ({ kind, word, record, virtual });
  const sameProgress = (a, b) => a && a.updatedAt === b.updatedAt && a.reviews === b.reviews &&
    a.dueAt === b.dueAt && a.lastGrade === b.lastGrade;

  function createReviewSession({ read, write, remove, inventory, options, clock }) {
    let round = null;
    let answer = null;
    function plan(now = clock()) {
      const { book, recalls } = inventory();
      const settings = options();
      const byWord = new Map(recalls.map(item => [item.word, item]));
      const cards = book.map(record => ({ kind: 'meaning', word: record.word, record,
        sibling: settings.reverse ? byWord.get(record.word) : undefined }));
      if (settings.reverse) {
        for (const meaning of book) {
          const record = byWord.get(meaning.word);
          if (record) cards.push({ kind: 'recall', word: meaning.word, record, sibling: meaning });
          else if (stateOf(meaning) === memory.State.Review) {
            cards.push({ kind: 'recall', word: meaning.word, record: createStudy(meaning.word, now),
              virtual: true, order: meaning.addedAt, sibling: meaning });
          }
        }
      }
      return { book, recalls, ...planReview(cards, now, settings, [...book, ...recalls]) };
    }
    function valid(entry, stored, settings) {
      const meaning = read('study:' + entry.word);
      if (!meaning || !read('word:' + entry.word) || (entry.kind === 'recall' && !settings.reverse)) return false;
      return entry.virtual ? !stored && stateOf(meaning) === memory.State.Review : sameProgress(stored, entry.record);
    }
    function clearCard() {
      round.current = null;
      round.typed = '';
      answer = null;
    }
    function current(early = false) {
      if (!round) return null;
      const now = clock();
      const settings = options();
      while (true) {
        if (!round.current) {
          round.learning.sort((a, b) => a.record.dueAt - b.record.dueAt);
          while (round.learning.length && !valid(round.learning[0], read(cardKey(round.learning[0])), settings)) round.learning.shift();
          const next = round.learning[0];
          round.current = next && (next.record.dueAt <= now || (early && !round.pending.length && next.record.dueAt - now <= LEARN_AHEAD))
            ? round.learning.shift() : round.pending.shift();
        }
        const entry = round.current;
        if (!entry || valid(entry, read(cardKey(entry)), settings)) return entry ?? null;
        clearCard();
      }
    }
    return {
      plan,
      get active() { return round !== null; },
      get presented() { return round?.current; },
      get revealed() { return answer !== null; },
      get typed() { return round?.typed ?? ''; },
      get undoWord() { return round?.history.at(-1)?.word; },
      get remaining() { return round.pending.length + round.learning.length + 1; },
      get waitingUntil() { return round?.learning[0]?.record.dueAt; },
      current,
      takeEarly() { return current(true); },
      start() {
        round = { pending: plan().round.map(entryOf), learning: [], current: null, history: [], typed: '' };
        answer = null;
      },
      reset() { round = null; answer = null; },
      type(entry, value) { if (entry && round?.current === entry && !answer) round.typed = value; },
      reveal(entry) {
        if (!entry || round?.current !== entry || answer) return false;
        answer = { at: clock() };
        return true;
      },
      grade(entry, grade) {
        if (!entry || round?.current !== entry) return null;
        const now = clock();
        const settings = options();
        const key = cardKey(entry);
        const before = read(key);
        if (!valid(entry, before, settings)) {
          clearCard();
          return entry.kind === 'recall' && !settings.reverse ? 'paused' : 'stale';
        }
        if (stateOf(entry.record) === memory.State.New) {
          const { book, recalls } = inventory();
          if (!newCardSlots([...book, ...recalls], now, settings.newPerDay)) {
            clearCard();
            return 'limited';
          }
        }
        if (answer && now - answer.at > ANSWER_LIMIT) {
          answer.at = now;
          return 'expired';
        }
        const next = schedule(before ?? entry.record, grade, now, settings.retention);
        const state = { pending: [...round.pending], learning: [...round.learning], current: entry };
        write(key, next);
        round.history.push({ key, word: entry.word, before, after: next, state });
        clearCard();
        if ([memory.State.Learning, memory.State.Relearning].includes(stateOf(next)) && next.dueAt - now <= LEARN_AHEAD) {
          round.learning.push(entryOf({ kind: entry.kind, word: entry.word, record: next }));
        }
        return 'saved';
      },
      undo() {
        const last = round?.history.at(-1);
        if (!last) return null;
        if (!sameProgress(read(last.key), last.after)) {
          round.history = [];
          return { stale: true };
        }
        if (last.before) write(last.key, last.before); else remove(last.key);
        round.history.pop();
        Object.assign(round, last.state, { typed: '' });
        answer = null;
        return { word: last.word };
      }
    };
  }
  function retentionStats(records, now, days = 30) {
    let total = 0;
    let passed = 0;
    for (const record of records) {
      for (const entry of record.log || []) {
        if (entry.state !== memory.State.Review || entry.at <= now - days * DAY || entry.at > now) continue;
        total++;
        if (entry.rating > 1) passed++;
      }
    }
    return { total, passed };
  }
  const wordPattern = (word, flags) => new RegExp(`(^|[^a-z'’-])(${word.replace(/'/g, "['’]")})(?![a-z'’-])`, flags);
  function contextParts(raw, word) {
    if (typeof raw !== 'string' || !word) return null;
    const found = wordPattern(word, 'i').exec(raw);
    if (!found) return null;
    const index = found.index + found[1].length;
    const before = raw.slice(0, index);
    const after = raw.slice(index + found[2].length);
    let head = before.slice(Math.max(...['.', '!', '?', '。', '！', '？'].map(mark => before.lastIndexOf(mark))) + 1).trimStart();
    const stop = after.search(/[.!?。！？]/);
    let tail = (stop < 0 ? after : after.slice(0, stop + 1)).trimEnd();
    if (head.length > 120) head = '…' + head.slice(-120).replace(/^\S*\s/, '');
    if (tail.length > 120) tail = tail.slice(0, 120).replace(/\s\S*$/, '') + '…';
    return { before: head, match: found[2], after: tail };
  }
  const csvCell = value => {
    let cell = String(value ?? '');
    if (/^[\s\uFEFF]*[=+\-@]/.test(cell) || /^[\t\r\n]/.test(cell)) cell = "'" + cell;
    return '"' + cell.replace(/"/g, '""') + '"';
  };
  const csv = rows => '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
  const translationSource = entry => entry.meanings.flatMap(meaning => meaning.definitions.map(def =>
    `${meaning.partOfSpeech ? meaning.partOfSpeech + ': ' : ''}${def.definition}`))
    .slice(0, 6).map((definition, index) => `${index + 1}. ${definition}`).join('\n');
  function translationChunks(source) {
    const chunks = [];
    let chunk = '';
    const encoder = new TextEncoder();
    for (const token of source.match(/\S+\s*|\s+/g) || []) {
      if (encoder.encode(chunk + token).length > 480 && chunk) { chunks.push(chunk); chunk = ''; }
      for (const character of token) {
        if (encoder.encode(chunk + character).length > 480) { chunks.push(chunk); chunk = ''; }
        chunk += character;
      }
    }
    if (chunk) chunks.push(chunk);
    return chunks;
  }
  const translationMatches = (cached, entry) => cached.translationSource
    ? cached.translationSource === translationSource(entry)
    : cached.meanings[0].definitions[0].definition === entry.meanings[0].definitions[0].definition;
  function splitTranslations(entry) {
    if (entry.translationProvider !== 'youdao') return entry;
    const updated = { ...entry };
    if (!entry.youdaoTranslation || entry.translatedAt > entry.youdaoTranslatedAt) {
      updated.youdaoTranslation = entry.translation;
      updated.youdaoTranslatedAt = entry.translatedAt;
    }
    delete updated.translation;
    delete updated.translatedAt;
    delete updated.translationSource;
    delete updated.translationProvider;
    return updated;
  }
  const chineseText = entry => [entry?.translation, entry?.youdaoTranslation].filter(Boolean).join('\n');
  function youdaoRecords(raw, word) {
    return [raw?.simple?.word, raw?.ec?.word].flatMap(items => Array.isArray(items) ? items : []).filter(item => {
      const phrase = item?.['return-phrase'];
      return normalize(typeof phrase === 'string' ? phrase : phrase?.l?.i) === word;
    });
  }
  function youdaoPhonetic(raw, word) {
    const records = youdaoRecords(raw, word);
    for (const item of records) {
      const value = [item.ukphone, item.usphone, item.phone].find(value =>
        typeof value === 'string' && value.trim() && value.length <= 148);
      if (value) return '/' + value.trim().replace(/^\/|\/$/g, '') + '/';
    }
    throw new Error('暂未找到该词的音标，可稍后重试');
  }
  function datamusePhonetic(raw, word) {
    const records = Array.isArray(raw) ? raw.filter(item => normalize(item?.word) === word && Array.isArray(item?.tags)) : [];
    for (const item of records) {
      const value = item.tags.filter(tag => typeof tag === 'string' && tag.startsWith('ipa_pron:'))
        .map(tag => tag.slice(9).trim()).find(value => value && value.length <= 148);
      if (value) return '/' + value.replace(/^\/|\/$/g, '') + '/';
    }
    throw new Error('暂未找到该词的备用 IPA 音标，可稍后重试');
  }
  function youdaoTranslation(raw, word) {
    const definitions = youdaoRecords(raw, word)
      .flatMap(item => Array.isArray(item.trs) ? item.trs : [])
      .flatMap(item => Array.isArray(item?.tr) ? item.tr : [])
      .flatMap(item => Array.isArray(item?.l?.i) ? item.l.i : [])
      .filter(value => typeof value === 'string' && value.trim() && /[\u3400-\u9fff]/.test(value))
      .map(value => value.trim());
    const translation = [...new Set(definitions)].slice(0, 6).join('\n');
    if (!translation) throw new Error('暂未找到该词的中文释义，可稍后重试');
    if (translation.length > 16000) throw new Error('中文响应过长，请稍后重试');
    return translation;
  }
  const MAX_EXAMPLES = 12;
  const MAX_DEFINITIONS = 20;
  const validExamples = value => Array.isArray(value) && value.length <= MAX_EXAMPLES && value.every(item =>
    item && typeof item.sentence === 'string' && !!item.sentence.trim() && item.sentence.length <= 600 &&
    typeof item.translation === 'string' && item.translation.length <= 600 &&
    typeof item.source === 'string' && item.source.length <= 120);
  function youdaoExamples(raw, word) {
    const full = typeof raw?.input === 'string' && raw.input.startsWith('lj:');
    if (normalize(full ? raw.input.slice(3) : raw?.input) !== word) throw new Error('例句词条不匹配，请稍后重试');
    const block = full ? raw.blng_sents : raw.blng_sents_part;
    if (block === undefined) return [];
    const pairs = block?.['sentence-pair'];
    if (!Array.isArray(pairs)) throw new Error('例句数据格式异常，请稍后重试');
    const examples = pairs.map(item => ({
      sentence: typeof item?.sentence === 'string' ? item.sentence.trim() : item?.sentence,
      translation: item?.['sentence-translation'] ?? '',
      source: item?.source ?? ''
    }));
    if (!examples.every(item => validExamples([item]))) throw new Error('例句数据格式异常，请稍后重试');
    return examples.filter((item, index) =>
      examples.findIndex(other => other.sentence.toLowerCase() === item.sentence.toLowerCase()) === index).slice(0, MAX_EXAMPLES);
  }
  const validWordForms = value => value && typeof value === 'object' &&
    typeof value.base === 'string' && !!value.base && normalize(value.base) === value.base &&
    Array.isArray(value.forms) && value.forms.length <= 20 && value.forms.every(item =>
      item && typeof item.name === 'string' && !!item.name.trim() && item.name.length <= 30 &&
      typeof item.value === 'string' && !!item.value.trim() && item.value.length <= 200);
  function youdaoWordForms(raw, word) {
    const records = youdaoRecords(raw, word);
    const item = records.find(item => item.prototype !== undefined || item.wfs !== undefined) || records[0];
    if (!item) throw new Error('暂未找到该词的词形信息，可稍后重试');
    if (item.wfs !== undefined && !Array.isArray(item.wfs)) throw new Error('词形数据格式异常，请稍后重试');
    const result = {
      base: item.prototype === undefined ? word : normalize(item.prototype),
      forms: (item.wfs || []).map(item => ({ name: item?.wf?.name, value: item?.wf?.value }))
    };
    if (!validWordForms(result)) throw new Error('词形数据格式异常，请稍后重试');
    result.forms = result.forms.filter((item, index, forms) =>
      forms.findIndex(other => other.name === item.name && other.value === item.value) === index);
    return result;
  }
  function dictionary(raw, word, now) {
    if (!Array.isArray(raw) || !raw.length) throw new Error('词典返回格式异常');
    const entries = raw.filter(entry => entry && typeof entry === 'object');
    const phonetics = entries.flatMap(entry => Array.isArray(entry.phonetics) ? entry.phonetics : []).filter(Boolean);
    const meanings = entries.flatMap(entry => Array.isArray(entry.meanings) ? entry.meanings : [])
      .filter(item => item && Array.isArray(item.definitions)).slice(0, 5).map(item => ({
        partOfSpeech: text(item.partOfSpeech, 50),
        definitions: item.definitions.filter(item => item && typeof item.definition === 'string' && item.definition.trim())
          .slice(0, MAX_DEFINITIONS).map(item => ({ definition: text(item.definition), example: text(item.example, 600) }))
      })).filter(item => item.definitions.length);
    if (!meanings.length) throw new Error('未找到可显示的释义');
    const first = entries[0];
    const phonetic = [...phonetics.map(item => item.text), ...entries.map(item => item.phonetic)]
      .find(value => typeof value === 'string' && value.trim());
    return {
      word, fetchedAt: now, phonetic: text(phonetic, 150).trim(),
      audio: phonetics.map(item => audioUrl(item.audio)).find(Boolean) || '', meanings,
      sourceUrl: safeUrl(first?.sourceUrls?.[0]),
      license: { name: text(first?.license?.name, 120), url: safeUrl(first?.license?.url) }
    };
  }
  const BACKUP_MIB = 32;
  function checkBackupSize(bytes) {
    if (bytes > BACKUP_MIB * 1024 * 1024) throw new Error(`Lexi JSON 备份超过 ${BACKUP_MIB} MiB，无法生成或导入可恢复的完整备份`);
  }
  function validateBackup(raw) {
    const fail = () => { throw new Error('备份格式无效或版本不兼容，未导入数据'); };
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    const timestamp = value => Number.isSafeInteger(value) && value > 0 && value <= 8640000000000000;
    const validWord = value => typeof value === 'string' && normalize(value) === value && value !== '';
    const string = (value, max) => typeof value === 'string' && value.length <= max;
    if (!object(raw) || ![1, 2, 3].includes(raw.schemaVersion) || !['words', 'history', 'book'].every(key => Array.isArray(raw[key]))) fail();
    if (raw.schemaVersion === 3 ? !Array.isArray(raw.recall) : raw.recall !== undefined) fail();
    const recall = raw.recall || [];
    const siteRules = validateSiteRules(raw.siteRules === undefined ? [] : raw.siteRules);
    if (raw.words.length > 10000 || raw.history.length > 30000 || raw.book.length > 10000 || recall.length > 10000) {
      throw new Error('备份超过记录上限：词条、正向和反向进度各最多 10,000 条，查询历史最多 30,000 条');
    }
    const unique = (items, key) => new Set(items.map(item => item[key])).size === items.length;
    if (![...raw.words, ...raw.history, ...raw.book, ...recall].every(object)) fail();
    if (!unique(raw.words, 'word') || !unique(raw.book, 'word') || !unique(recall, 'word') || !unique(raw.history, 'id')) fail();
    const words = raw.words.map(item => {
      if (!validWord(item.word) || !timestamp(item.fetchedAt) || !string(item.phonetic, 150) ||
        !Array.isArray(item.meanings) || !item.meanings.length || item.meanings.length > 5) fail();
      const meanings = item.meanings.map(meaning => {
        if (!object(meaning) || !string(meaning.partOfSpeech, 50) || !Array.isArray(meaning.definitions) ||
          !meaning.definitions.length || meaning.definitions.length > MAX_DEFINITIONS) fail();
        return {
          partOfSpeech: meaning.partOfSpeech, definitions: meaning.definitions.map(def => {
            if (!object(def) || !string(def.definition, 1200) || !def.definition.trim() || !string(def.example, 600)) fail();
            return { definition: def.definition, example: def.example };
          })
        };
      });
      if (item.translation !== undefined && (!string(item.translation, 16000) || !timestamp(item.translatedAt))) fail();
      if (item.translationSource !== undefined && (!item.translation || !string(item.translationSource, 8000))) fail();
      if (item.translationProvider !== undefined && (!item.translation || !['mymemory', 'google', 'youdao'].includes(item.translationProvider))) fail();
      if ((item.youdaoTranslation !== undefined || item.youdaoTranslatedAt !== undefined) &&
        (!string(item.youdaoTranslation, 16000) || !item.youdaoTranslation.trim() || !timestamp(item.youdaoTranslatedAt))) fail();
      if (item.phoneticSource !== undefined && (!['youdao', 'datamuse'].includes(item.phoneticSource) || !item.phonetic.trim())) fail();
      if (item.wordForms !== undefined && !validWordForms(item.wordForms)) fail();
      if ((item.examples !== undefined || item.examplesFetchedAt !== undefined) &&
        (!validExamples(item.examples) || !timestamp(item.examplesFetchedAt))) fail();
      return splitTranslations({
        word: item.word, fetchedAt: item.fetchedAt, phonetic: item.phonetic.trim(), meanings,
        ...(item.phoneticSource ? { phoneticSource: item.phoneticSource } : {}),
        ...(item.wordForms ? { wordForms: {
          base: item.wordForms.base, forms: item.wordForms.forms.map(({ name, value }) => ({ name, value }))
        } } : {}),
        ...(item.examples ? { examples: item.examples.map(({ sentence, translation, source }) => ({ sentence, translation, source })),
          examplesFetchedAt: item.examplesFetchedAt } : {}),
        audio: audioUrl(item.audio), sourceUrl: safeUrl(item.sourceUrl),
        license: { name: text(item.license?.name, 120), url: safeUrl(item.license?.url) },
        ...(item.translation ? {
          translation: item.translation, translatedAt: item.translatedAt,
          ...(item.translationSource ? { translationSource: item.translationSource } : {}),
          ...(item.translationProvider ? { translationProvider: item.translationProvider } : {})
        } : {}),
        ...(item.youdaoTranslation ? { youdaoTranslation: item.youdaoTranslation, youdaoTranslatedAt: item.youdaoTranslatedAt } : {})
      });
    });
    const wordSet = new Set(words.map(item => item.word));
    const history = raw.history.map(item => {
      if (!validWord(item.word) || !wordSet.has(item.word) || !timestamp(item.at) ||
        typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{10,80}$/.test(item.id)) fail();
      return {
        id: item.id, word: item.word, at: item.at,
        context: text(item.context, 300), title: text(item.title, 120), sourceUrl: safeUrl(item.sourceUrl)
      };
    });
    const progress = item => {
      if (!validWord(item.word) || !wordSet.has(item.word) || !timestamp(item.addedAt) || !timestamp(item.updatedAt) ||
        !timestamp(item.dueAt) || !Number.isInteger(item.stage) || item.stage < 0 || item.stage > 6 ||
        !Number.isSafeInteger(item.reviews) || item.reviews < 0 ||
        (item.lastReviewedAt !== 0 && !timestamp(item.lastReviewedAt)) ||
        !['', 'again', 'hard', 'good', ...(raw.schemaVersion >= 2 ? ['easy'] : [])].includes(item.lastGrade)) fail();
      const record = {
        word: item.word, addedAt: item.addedAt, updatedAt: item.updatedAt, dueAt: item.dueAt,
        stage: item.stage, reviews: item.reviews, lastReviewedAt: item.lastReviewedAt, lastGrade: item.lastGrade
      };
      if (item.log !== undefined) {
        if (raw.schemaVersion < 3 || !Array.isArray(item.log) || !item.log.length || item.log.length > item.reviews) fail();
        record.log = item.log.map((entry, index) => {
          if (!object(entry) || !timestamp(entry.at) || !Number.isInteger(entry.rating) || entry.rating < 1 || entry.rating > 4 ||
            !Number.isInteger(entry.state) || entry.state < 0 || entry.state > 3 ||
            (index && entry.at < item.log[index - 1].at)) fail();
          return { at: entry.at, rating: entry.rating, state: entry.state };
        });
        const last = record.log.at(-1);
        if (last.at !== item.lastReviewedAt || last.rating !== GRADES[item.lastGrade]) fail();
      }
      if (item.fsrs === undefined) {
        if (raw.schemaVersion >= 2) fail();
        return migrateStudy(record);
      }
      const card = item.fsrs;
      const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
      if (!object(card) || card.due !== item.dueAt || card.reps !== item.reviews ||
        !Number.isInteger(card.state) || !finite(card.state, 0, 3) ||
        !finite(card.stability, 0, 36500) || !finite(card.difficulty, 0, 10) ||
        !finite(card.elapsed_days, 0, 100000000) ||
        !Number.isInteger(card.scheduled_days) || !finite(card.scheduled_days, 0, 36500) ||
        !Number.isInteger(card.learning_steps) || !finite(card.learning_steps, 0, 2) ||
        !Number.isSafeInteger(card.lapses) || !finite(card.lapses, 0, card.reps)) fail();
      if (card.state === memory.State.New) {
        if (card.reps || card.stability || card.difficulty || card.lapses || card.learning_steps ||
          card.scheduled_days || item.lastReviewedAt || item.lastGrade || card.last_review !== undefined) fail();
      } else if (!card.reps || card.stability < 0.001 || card.difficulty < 1 ||
        !timestamp(card.last_review) || card.last_review !== item.lastReviewedAt || card.last_review > card.due ||
        !Object.hasOwn(GRADES, item.lastGrade)) fail();
      return {
        ...record, fsrs: {
          due: card.due, stability: card.stability, difficulty: card.difficulty,
          elapsed_days: card.elapsed_days, scheduled_days: card.scheduled_days, learning_steps: card.learning_steps,
          reps: card.reps, lapses: card.lapses, state: card.state,
          ...(card.last_review !== undefined ? { last_review: card.last_review } : {})
        }
      };
    };
    const book = raw.book.map(progress);
    const bookWords = new Set(book.map(item => item.word));
    const recallBook = recall.map(item => {
      if (!bookWords.has(item.word)) fail();
      return progress(item);
    });
    return { schemaVersion: 3, words, history, book, recall: recallBook, siteRules };
  }
  function mergeBackup(current, incoming, retention, summary) {
    const words = new Map(current.words.map(item => [item.word, splitTranslations(item)]));
    for (const incomingWord of incoming.words) {
      const item = splitTranslations(incomingWord);
      const old = words.get(item.word);
      const newer = !old || item.fetchedAt > old.fetchedAt ? item : old;
      const translation = [old, item].filter(value => value?.translation && translationMatches(value, newer))
        .sort((a, b) => b.translatedAt - a.translatedAt)[0];
      const youdao = [old, item].filter(value => value?.youdaoTranslation)
        .sort((a, b) => b.youdaoTranslatedAt - a.youdaoTranslatedAt)[0];
      const combined = { ...newer };
      const examples = [old, item].filter(value => value?.examples)
        .sort((a, b) => b.examplesFetchedAt - a.examplesFetchedAt)[0];
      if (examples) Object.assign(combined, { examples: examples.examples, examplesFetchedAt: examples.examplesFetchedAt });
      const wordForms = [newer, old, item].find(value => value?.wordForms)?.wordForms;
      if (wordForms) combined.wordForms = wordForms;
      const phonetic = [newer, old, item].find(value => value?.phonetic?.trim());
      if (phonetic) {
        combined.phonetic = phonetic.phonetic;
        delete combined.phoneticSource;
        if (phonetic.phoneticSource) combined.phoneticSource = phonetic.phoneticSource;
      }
      delete combined.translation;
      delete combined.translatedAt;
      delete combined.translationSource;
      delete combined.translationProvider;
      delete combined.youdaoTranslation;
      delete combined.youdaoTranslatedAt;
      words.set(item.word, {
        ...combined, ...(translation ? {
          translation: translation.translation, translatedAt: translation.translatedAt,
          ...(translation.translationSource ? { translationSource: translation.translationSource } : {}),
          ...(translation.translationProvider ? { translationProvider: translation.translationProvider } : {})
        } : {}),
        ...(youdao ? { youdaoTranslation: youdao.youdaoTranslation, youdaoTranslatedAt: youdao.youdaoTranslatedAt } : {})
      });
    }
    const history = new Map(current.history.map(item => [item.id, item]));
    for (const item of incoming.history) {
      const old = history.get(item.id);
      if (old && (old.word !== item.word || old.at !== item.at)) throw new Error('历史 ID 冲突，未导入数据');
      if (!old) history.set(item.id, item);
    }
    const mergeCards = (local, imported) => {
      const cards = new Map(local.map(item => [item.word, item]));
      for (const item of imported) {
        const { record, action } = mergeProgress(cards.get(item.word), item, retention);
        if (summary) summary[action]++;
        cards.set(item.word, record);
      }
      return [...cards.values()];
    };
    return { words: [...words.values()], history: [...history.values()],
      book: mergeCards(current.book, incoming.book), recall: mergeCards(current.recall || [], incoming.recall || []) };
  }
  const logKey = entry => entry.at + ':' + entry.rating;
  function mergeProgress(current, incoming, retention) {
    if (!current) return { record: incoming, action: 'added' };
    const newer = incoming.updatedAt > current.updatedAt ? incoming : current;
    const other = newer === incoming ? current : incoming;
    const known = new Set((newer.log || []).map(logKey));
    const extra = (other.log || []).filter(entry => !known.has(logKey(entry)));
    const complete = record => (record.log || []).length === record.reviews;
    if (!complete(newer) || !complete(other)) return { record: newer, action: 'incomplete' };
    if (!extra.length) return { record: newer, action: 'unchangedLog' };
    const log = [...(newer.log || []), ...extra].sort((a, b) => a.at - b.at || a.rating - b.rating);
    if (log[0].state !== memory.State.New) return { record: newer, action: 'incomplete' };
    const grades = Object.keys(GRADES);
    let state = createStudy(newer.word, Math.min(newer.addedAt, other.addedAt));
    for (const entry of log) state = schedule(state, grades[entry.rating - 1], entry.at, retention);
    return { record: state, action: 'replayed' };
  }
  const ordered = (events, oldest = false) => [...events].sort((a, b) =>
    (oldest ? 1 : -1) * (a.at - b.at || a.id.localeCompare(b.id)));
  const groupHistory = (events, order = 'new') => {
    const groups = new Map();
    for (const event of events) {
      if (!groups.has(event.word)) groups.set(event.word, []);
      groups.get(event.word).push(event);
    }
    return [...groups].map(([word, records]) => {
      const history = ordered(records);
      return { word, events: history, latestAt: history[0].at, firstAt: history.at(-1).at };
    }).sort((a, b) => {
      if (order === 'count' && a.events.length !== b.events.length) return b.events.length - a.events.length;
      if (order === 'old' && a.firstAt !== b.firstAt) return a.firstAt - b.firstAt;
      if (order !== 'old' && a.latestAt !== b.latestAt) return b.latestAt - a.latestAt;
      return a.word.localeCompare(b.word);
    });
  };
  if (typeof window === 'undefined') {
    loadMemory();
    module.exports = { normalize, classifyQuery, schedule, scheduleAll, migrateStudy, createStudy, reviewInterval, csv, dictionary, validateBackup, mergeBackup, ordered, groupHistory, audioUrl, translationSource, translationChunks, youdaoTranslation, youdaoExamples, youdaoPhonetic, datamusePhonetic, youdaoWordForms,
      dayStart, nextDayStart, availableAt, planReview, createReviewSession, retentionStats, contextParts, isLeech,
      pageScope, siteState, validateSiteRules };
    return;
  }

  const get = (key, fallback) => {
    const value = GM_getValue(PREFIX + key, fallback);
    return key.startsWith('word:') && value ? splitTranslations(value) : value;
  };
  const put = (key, value) => GM_setValue(PREFIX + key, value);
  const remove = key => GM_deleteValue(PREFIX + key);
  const notify = () => put('revision', crypto.randomUUID());
  const all = type => GM_listValues().filter(key => key.startsWith(PREFIX + type + ':')).map(key => GM_getValue(key)).filter(Boolean);
  const ruleKey = rule => 'disabled:' + rule.type + ':' + encodeURIComponent(rule.value);
  const readSiteRules = () => validateSiteRules(all('disabled'));
  const readSiteState = () => {
    const scope = pageScope(location.href);
    const rules = ['page', 'domain'].map(type => get(ruleKey({ type, value: scope[type] }), null)).filter(Boolean);
    return siteState(location.href, validateSiteRules(rules));
  };
  const learningSnapshot = () => ({
    schemaVersion: 3,
    words: all('word').map(splitTranslations), history: ordered(all('event'), true), book: all('study').map(migrateStudy),
    recall: all('recall').map(migrateStudy)
  });
  const snapshot = () => ({
    ...learningSnapshot(), exportedAt: new Date().toISOString(), settings: cleanSettings(get('settings', {})), siteRules: readSiteRules()
  });
  function writeLearningData(data, previous) {
    let changed = false;
    for (const [field, type, id] of [['words', 'word', 'word'], ['history', 'event', 'id'],
      ['book', 'study', 'word'], ['recall', 'recall', 'word']]) {
      const before = new Map((previous?.[field] || []).map(item => [item[id], item]));
      for (const item of data[field]) {
        if (JSON.stringify(before.get(item[id])) === JSON.stringify(item)) continue;
        put(type + ':' + item[id], item);
        changed = true;
      }
    }
    return changed;
  }
  const SYNC_HELP = 'https://help.jianguoyun.com/?p=2064';
  const LEGACY_SYNC_FILE = 'lexi-sync.json';
  const SYNC_SNAPSHOT = /^lexi-sync-snapshot-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\.json$/;
  const DAV_NS = 'DAV:';
  const DAV_LIST_QUERY = '<propfind xmlns="DAV:"><prop><resourcetype/></prop></propfind>';
  const cloudFolderUrl = config => `https://dav.jianguoyun.com/dav/${encodeURIComponent(config.folder)}/`;
  function syncContent({ words, history, book, recall }) {
    const byWord = items => [...items].sort((a, b) => a.word.localeCompare(b.word));
    return JSON.stringify({ schemaVersion: 3, words: byWord(words), history: ordered(history, true),
      book: byWord(book), recall: byWord(recall) });
  }
  function webdavRequest(config, method, filename, data, headers = {}) {
    const url = cloudFolderUrl(config) + filename;
    const credentials = new TextEncoder().encode(`${config.account}:${config.password}`);
    const authorization = 'Basic ' + btoa(Array.from(credentials, byte => String.fromCharCode(byte)).join(''));
    return new Promise((resolve, reject) => {
      let handle;
      let done = false;
      const finish = (error, response) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (error) reject(error); else resolve(response);
      };
      const abort = error => {
        finish(error);
        handle?.abort();
      };
      const timedOut = () => new Error('连接坚果云超时，请稍后重试');
      const failed = () => new Error('无法连接坚果云，请检查网络和油猴的联网权限');
      const timer = setTimeout(() => abort(timedOut()), 60000);
      try {
        handle = GM_xmlhttpRequest({
          method, url, anonymous: true, redirect: 'error', timeout: 60000,
          headers: { Authorization: authorization, 'Cache-Control': 'no-cache', ...headers },
          ...(data !== undefined ? { data } : {}),
          onload: response => {
            if (response.finalUrl && response.finalUrl !== url) finish(new Error('坚果云返回了意外的请求地址，已停止同步'));
            else finish(null, response);
          },
          onprogress: ({ loaded, total }) => {
            if (method !== 'GET' && method !== 'PROPFIND') return;
            try { checkBackupSize(Math.max(loaded || 0, total || 0)); } catch (error) { abort(error); }
          },
          onerror: () => finish(failed()), ontimeout: () => abort(timedOut()),
          onabort: () => finish(new Error('坚果云同步已取消'))
        });
      } catch { finish(failed()); }
    });
  }
  function webdavError(status) {
    if (status === 401) return new Error('坚果云认证失败，请检查账号和第三方应用密码');
    if (status === 403) return new Error('坚果云拒绝访问，请检查应用密码和同步文件夹的读写权限');
    if (status === 404 || status === 409) return new Error('找不到坚果云同步文件夹，请先创建同名的一级文件夹并检查名称');
    if (status === 412 || status === 423) return new Error('云端文件已变化或正在使用，请稍后重新同步');
    if (status === 429 || status === 507) return new Error('坚果云请求受限或空间不足，请检查账号额度后重试');
    return new Error(`坚果云请求失败（HTTP ${status}），请稍后重试`);
  }
  function checkedDavText(response) {
    checkBackupSize(new TextEncoder().encode(response.responseText).length);
    return response.responseText;
  }
  async function listCloudSnapshots(config) {
    const listing = await webdavRequest(config, 'PROPFIND', '', DAV_LIST_QUERY, {
      Depth: '1', 'Content-Type': 'application/xml; charset=utf-8'
    });
    if (listing.status !== 207) throw webdavError(listing.status);
    const root = new DOMParser().parseFromString(checkedDavText(listing), 'application/xml').documentElement;
    if (root?.namespaceURI !== DAV_NS || root.localName !== 'multistatus') {
      throw new Error('坚果云返回的文件列表无效，未同步');
    }
    const folder = new URL(cloudFolderUrl(config));
    const folderPath = decodeURIComponent(folder.pathname);
    const child = (node, name) => [...node.children].find(item => item.namespaceURI === DAV_NS && item.localName === name);
    const resources = [...root.children].filter(node => node.namespaceURI === DAV_NS && node.localName === 'response');
    if (resources.length >= 750) throw new Error('坚果云同步文件夹条目过多，文件列表可能不完整。请移出与 Lexi 无关的文件后重试');
    const files = new Set();
    for (const resource of resources) {
      const href = child(resource, 'href')?.textContent.trim();
      if (!href) continue;
      let filename;
      try {
        const url = new URL(href, folder);
        const path = decodeURIComponent(url.pathname);
        if (url.origin !== folder.origin || url.search || url.hash || !path.startsWith(folderPath)) continue;
        filename = path.slice(folderPath.length);
      } catch { continue; }
      if (!SYNC_SNAPSHOT.test(filename)) continue;
      const propstat = [...resource.children].find(node => node.namespaceURI === DAV_NS && node.localName === 'propstat' &&
        /^HTTP\/\S+ 200(?: |$)/.test(child(node, 'status')?.textContent.trim() || ''));
      const prop = propstat && child(propstat, 'prop');
      const kind = prop && child(prop, 'resourcetype');
      if (!kind) {
        throw new Error('坚果云未返回完整的同步快照信息，未同步');
      }
      if (!child(kind, 'collection')) files.add(filename);
    }
    return [...files].sort();
  }
  function readCloudBackup(response) {
    if (response.status !== 200) throw webdavError(response.status);
    const body = checkedDavText(response);
    let parsed;
    try { parsed = JSON.parse(body); }
    catch { throw new Error('云端文件不是有效的 Lexi JSON，未同步，请检查同步文件夹'); }
    return validateBackup(parsed);
  }
  async function syncWithNutstore(config) {
    const sameConfig = () => {
      const current = get('nutstore-sync', null);
      return current?.account === config.account && current.folder === config.folder && current.password === config.password;
    };
    const retention = cleanSettings(get('settings', {})).retention;
    const merge = (current, incoming) => validateBackup({ schemaVersion: 3, ...mergeBackup(current, incoming, retention) });
    const legacy = await webdavRequest(config, 'GET', LEGACY_SYNC_FILE);
    const base = legacy.status === 404 ? { schemaVersion: 3, words: [], history: [], book: [], recall: [] } : readCloudBackup(legacy);
    let files, cloud, previousContent;
    // A concurrent sync may replace snapshots between listing and reading them.
    for (let attempt = 0; attempt < 2; attempt++) {
      files = await listCloudSnapshots(config);
      cloud = base;
      previousContent = null;
      for (const filename of files) {
        const file = await webdavRequest(config, 'GET', filename);
        if (file.status === 404) { cloud = null; break; }
        const snapshot = readCloudBackup(file);
        cloud = merge(cloud, snapshot);
        if (files.length === 1) previousContent = syncContent(snapshot);
      }
      if (cloud) break;
    }
    if (!cloud) throw webdavError(412);
    const revision = get('revision', null);
    const checkLocal = () => {
      if (!sameConfig() || get('revision', null) !== revision) {
        throw new Error('同步期间本机数据或配置已变化，未写入本机，请重新同步');
      }
    };
    checkLocal();
    const local = validateBackup(learningSnapshot());
    const merged = merge(cloud, local);
    const data = syncContent(merged);
    const upload = data !== previousContent;
    if (upload) {
      checkBackupSize(new TextEncoder().encode(data).length);
      const name = `lexi-sync-snapshot-${crypto.randomUUID()}.json`;
      const saved = await webdavRequest(config, 'PUT', name, data, { 'Content-Type': 'application/json; charset=utf-8', 'If-None-Match': '*' });
      if (![200, 201, 204].includes(saved.status)) throw webdavError(saved.status);
    }
    checkLocal();
    let changed;
    try { changed = writeLearningData(merged, local); }
    catch {
      notify();
      throw new Error('本机写入中断，部分记录可能已合并；原记录未主动删除，可再次同步');
    }
    if (changed) notify();
    put('nutstore-sync', { ...config, lastSyncAt: Date.now() });
    let cleanupPending = false;
    if (upload) {
      // Only remove snapshots we read and merged. Unseen uploads and the legacy file are untouched.
      for (const filename of files) {
        if (!sameConfig()) { cleanupPending = true; break; }
        try {
          const removed = await webdavRequest(config, 'DELETE', filename);
          if (removed.status !== 404 && (removed.status < 200 || removed.status >= 300 || removed.status === 207)) {
            cleanupPending = true; break;
          }
        } catch { cleanupPending = true; break; }
      }
    }
    const details = `同步完成：${merged.words.length} 个词条、${merged.history.length} 条历史、${merged.book.length} 个生词`;
    return { changed, message: details + (cleanupPending ? '；部分旧快照未清理，不影响同步' : '') };
  }
  let ui;
  let currentSite;
  let menuSignature = '';
  const menuIds = [];
  function reportError(error) {
    if (ui && !currentSite?.disabled) ui.showError(error);
    else alert(error?.message || '操作失败，请重试');
  }
  function menu(label, action) {
    menuIds.push(GM_registerMenuCommand(label, () => {
      try { return Promise.resolve(action()).catch(reportError); }
      catch (error) { reportError(error); }
    }));
  }
  function updateMenus() {
    const signature = JSON.stringify(currentSite);
    if (signature === menuSignature) return;
    for (const id of menuIds) GM_unregisterMenuCommand(id);
    menuIds.length = 0;
    menuSignature = signature;
    menu('Lexi：' + (currentSite.disabled ? '当前网页已禁用' : '当前网页已启用'), () => openUI('sites'));
    menu(currentSite.disabled ? '打开 Lexi 学习中心（手动）' : '打开 Lexi 学习中心', () => openUI());
    for (const type of ['page', 'domain']) {
      const disabled = currentSite[type + 'Disabled'];
      const label = type === 'page' ? '此页面' : '此域名';
      menu(disabled ? '解除' + label + '禁用' : '禁用' + label,
        () => changeSiteRule({ type, value: pageScope(location.href)[type] }, !readSiteState()[type + 'Disabled']));
    }
    menu('管理网页启用范围', () => openUI('sites'));
    menu('暂停 / 开启自动划词', () => {
      const next = cleanSettings({ ...get('settings', {}), auto: !cleanSettings(get('settings', {})).auto });
      put('settings', next); notify();
      ui?.refresh();
      if (!currentSite.disabled) ui.showError({ message: next.auto ? '自动划词已开启' : '自动划词已暂停' });
      else alert((next.auto ? '自动划词已开启' : '自动划词已暂停') + '；当前网页仍受禁用规则限制');
    });
  }
  function syncSite() {
    const next = readSiteState();
    const changed = JSON.stringify(next) !== JSON.stringify(currentSite);
    currentSite = next;
    if (!next.disabled && !ui) ui = createUI();
    ui?.applySite(changed);
    updateMenus();
  }
  function openUI(screen) {
    syncSite();
    if (!ui) ui = createUI();
    ui.open(screen);
  }
  function changeSiteRule(rule, disable) {
    rule = validateSiteRules([rule])[0];
    if (disable && rule.type === 'domain' &&
      !confirm(`禁用 ${rule.value} 的全部页面？\n不包含其他子域名。可通过油猴菜单解除禁用。`)) return;
    if (disable && !get(ruleKey(rule), null) && readSiteRules().length >= 10000) {
      throw new Error('网页禁用规则已达 10,000 条，请先解除不再需要的规则');
    }
    if (disable) put(ruleKey(rule), rule);
    else remove(ruleKey(rule));
    syncSite();
    ui?.refresh(true);
    put('scope-revision', crypto.randomUUID());
  }
  function createUI() {
  loadMemory();
  const date = value => new Date(value).toLocaleString('zh-CN', { hour12: false });
  const when = (record, at = availableAt(record)) => stateOf(record) === memory.State.Review
    ? new Date(at).toLocaleDateString('zh-CN') : date(at);
  let settings = cleanSettings(get('settings', {}));
  let queryEpoch = 0;
  let activeRequest;
  let cancelSentence;
  let activeAudio;
  let audioEpoch = 0;
  let ownSpeech = false;
  let selectedWord = '';
  let screen = 'history';
  const libraryState = {
    history: { filter: '', page: 0 },
    book: { filter: '', page: 0 }
  };
  let scopeFilter = '';
  let scopePage = 0;
  let historyOrder = 'new';
  const review = createReviewSession({
    read: get, write: put, remove,
    inventory: () => ({ book: all('study'), recalls: all('recall') }),
    options: () => cleanSettings(get('settings', {})),
    clock: () => Date.now()
  });
  let reviewContexts = new Map();
  let reviewTimer;
  let returnFocus;
  let internalLookup = null;
  let internalSelectionTimer;
  let internalPointerDown = false;
  let selectionPointerDown = false;
  let lastSelectionPointerType = '';
  let pendingSelection = null;
  let selectionActionRefreshTimer;
  let selectionTimer;
  let lastSelection = '';
  let lastSelectionAt = 0;
  let lastSelectionTransient = false;
  let refreshLibrary = null;
  let librarySheet = null;
  let activityEpoch = 0;
  const requests = new Set();
  const host = document.createElement('div');
  host.id = 'lexi-local-root';
  host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;';
  const shadow = host.attachShadow({ mode: 'closed' });
  document.documentElement.append(host);
  const el = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  function button(label, action, className = 'button', hint = '') {
    const node = el('button', className, label);
    node.type = 'button';
    if (hint) { node.title = hint; node.setAttribute('aria-label', hint); }
    node.addEventListener('click', () => Promise.resolve().then(action).then(() => {
      if (!overlay.hidden && !shadow.activeElement) focusStudio();
    }).catch(showError));
    return node;
  }
  function link(label, url) {
    const node = el('a', 'link', label);
    node.href = safeUrl(url) || 'https://dictionaryapi.dev/';
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
    return node;
  }
  const style = el('style');
  style.textContent = `
    :host{--paper:#fafaf7;--surface:#fff;--ink:#1e302b;--muted:#738079;--line:#e4e9e2;--accent:#23634c;--tint:#edf4ed;--error:#a33c36;all:initial;color-scheme:light}
    *{box-sizing:border-box} [hidden]{display:none!important}
    .app{font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;color:var(--ink);letter-spacing:0;text-align:left;direction:ltr}
    button,input,select{font:inherit}button,a,input,select{touch-action:manipulation}button{cursor:pointer}button:disabled{cursor:wait;opacity:.55}button,select{flex-shrink:0;white-space:nowrap}.search input,.row>input{flex:1;width:0}select{min-width:76px}
    button:focus-visible,a:focus-visible{outline:3px solid #75ac8c;outline-offset:3px}input:focus-visible,select:focus-visible{outline:none;background:var(--tint)}
    .launcher{pointer-events:auto;position:fixed;right:24px;bottom:24px;width:46px;height:46px;border:1px solid #ffffff40;border-radius:16px;background:var(--accent);color:white;box-shadow:0 6px 25px #102a2025;font:italic 28px Georgia,serif;touch-action:none;user-select:none;cursor:grab}
    .launcher.dragging{cursor:grabbing}
    .launcher.selection-active{visibility:hidden;pointer-events:none}
    .selection-action{pointer-events:auto;position:fixed;z-index:4;min-height:44px;max-width:min(220px,calc(100vw - 24px));touch-action:manipulation;user-select:none;white-space:nowrap;box-shadow:0 5px 20px #102a2030}
    .selection-emblem,.selection-summary,.selection-arrow{display:none}
    .popover{pointer-events:auto;position:fixed;width:min(380px,calc(100vw - 24px));max-height:70vh;overflow:auto;background:var(--surface);border:1px solid var(--line);border-radius:18px;box-shadow:0 16px 65px #102a2026;padding:22px}
    .popover-footer{margin-top:20px;padding-top:16px;border-top:1px solid var(--line)}.popover-footer .button{display:block;width:100%;min-height:44px}
    .bar,.row,.actions{display:flex;align-items:center;gap:10px}.bar{justify-content:space-between}.actions{flex-wrap:wrap}.brand{font-weight:750;letter-spacing:3px;font-size:12px}.muted,.meta{color:var(--muted);font-size:12px}.meta{margin-top:4px}.word{font:42px/1.2 Georgia,"Times New Roman",serif;overflow-wrap:anywhere;margin:20px 0 6px}.phonetic{color:var(--muted);font-size:14px;margin-bottom:14px}
    .button,.icon,.tab{border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:10px;padding:8px 13px;transition:background .12s}.button:hover,.icon:hover{background:var(--tint)}.primary{background:var(--accent);color:white;border-color:var(--accent)}.primary:hover{filter:brightness(1.1);background:var(--accent)}.icon{padding:5px 9px;font-size:16px}.danger{color:var(--error)}.active{background:var(--tint);border-color:var(--accent);color:var(--accent)}
    .sense{border-top:1px solid var(--line);padding-top:15px;margin-top:18px}.pos{display:inline-block;color:var(--accent);font-size:12px;font-weight:650;margin-bottom:6px}.definition{margin:0 0 10px;line-height:1.75}.example{color:var(--muted);border-left:2px solid var(--line);padding-left:10px;margin:5px 0 14px;font-size:13px}.translation{background:var(--tint);padding:14px;border-radius:10px;margin-top:14px}.source{border-top:1px solid var(--line);margin-top:20px;padding-top:12px;display:flex;flex-wrap:wrap;gap:8px;font-size:11px}.link{color:var(--accent);text-decoration:none}.link:hover{text-decoration:underline}.context{font-size:13px;margin-top:18px;color:var(--muted);overflow-wrap:anywhere}.error{color:var(--error)}
    .usage-examples{overflow-wrap:anywhere}.example-en{color:var(--ink);margin:0 0 4px;line-height:1.7}.example-zh{margin:0 0 4px;line-height:1.65}.example-word{color:var(--accent)}
    .usage-examples>.link{display:inline-block;margin-top:4px}.usage-examples>.button{display:block;margin-top:12px;min-height:44px}
    .overlay{pointer-events:auto;position:fixed;inset:0;background:#0d211f55;backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:24px}.studio{background:var(--paper);border:1px solid var(--line);border-radius:24px;box-shadow:0 30px 100px #081d2038;width:min(1060px,100%);height:min(760px,90vh);display:grid;grid-template-columns:166px minmax(0,1fr);overflow:hidden}.sidebar{padding:28px 18px;background:var(--surface);border-right:1px solid var(--line);display:flex;flex-direction:column;gap:8px}.logo{font:italic 34px Georgia,serif;margin:0 10px}.sidebar .muted{margin:0 10px 28px}.tab{text-align:left;border-color:transparent;background:transparent;padding:11px 14px}.tab.active{background:var(--tint);color:var(--accent);font-weight:650}.sidebar .footnote{margin-top:auto;font-size:11px;color:var(--muted);padding:12px}
    .main{min-width:0;display:flex;flex-direction:column}.top{padding:22px 26px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--line)}.search{display:flex;gap:8px;flex:1;min-width:0}input,select{color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:9px 12px;min-width:0}input{width:100%}input::placeholder{color:var(--muted)}.view{padding:24px 26px;overflow:auto;min-height:0;flex:1}.heading{font-size:24px;letter-spacing:-.5px;margin:0;font-weight:650}.subheading{font-size:13px;color:var(--muted);margin:5px 0 22px}.split{display:grid;grid-template-columns:240px minmax(0,1fr);gap:24px}.list{display:flex;flex-direction:column;gap:6px;margin-top:12px;max-height:440px;overflow:auto;padding:4px}.item{display:block;width:100%;text-align:left;padding:11px 12px;border-radius:12px;background:transparent;border:1px solid transparent;color:var(--ink)}.item:hover{background:var(--surface)}.item.active{background:var(--tint);border-color:var(--line)}.item .term{font:22px Georgia,serif}.detail{min-width:0}.detail .word{margin-top:8px}.empty{color:var(--muted);text-align:center;padding:45px 15px;font-size:14px}.section{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px;margin:16px 0}.section h3{margin:0 0 14px;font-size:15px}.setting{display:flex;justify-content:space-between;align-items:center;gap:14px;margin:16px 0}.setting input{width:18px;height:18px;accent-color:var(--accent)}.notice{font-size:12px;color:var(--muted);margin-top:12px}.review{text-align:center;max-width:540px;margin:25px auto}.review .word{font-size:54px;margin:35px 0 12px}.review-answer{text-align:left;margin:25px 0}.stats{display:flex;gap:12px;margin:24px 0}.stat{flex:1;padding:18px;background:var(--surface);border:1px solid var(--line);border-radius:15px}.stat strong{display:block;font:32px Georgia,serif;color:var(--accent)}.toast{pointer-events:auto;position:fixed;left:50%;bottom:25px;transform:translateX(-50%);max-width:calc(100vw - 32px);background:var(--ink);color:var(--surface);padding:12px 20px;border-radius:12px;box-shadow:0 5px 25px #0002;z-index:2}
    .review-grades{display:grid;grid-template-columns:repeat(4,minmax(0,68px)) 40px;justify-content:center;gap:14px;margin:12px 0}
    .review-grades .button{min-width:0;padding-inline:0}
    .review-grade-help{display:grid;place-items:center;align-self:stretch;padding:0;color:var(--accent);background:transparent}
    .review-grade-help:hover,.review-grade-help[aria-expanded="true"]{background:var(--tint)}
    .review-grade-help span{display:grid;place-items:center;width:18px;height:18px;border:1px solid currentColor;border-radius:50%;font-size:12px;font-weight:650;line-height:1}
    .review-grade-guide{max-width:440px;margin:0 auto 14px;padding:14px 16px;text-align:left;background:var(--surface);border:1px solid var(--line);border-radius:14px}
    .review-grade-guide h3{margin:0;font-size:14px}.review-grade-guide p{margin:4px 0 0}
    .review-grade-guide dl{margin:10px 0}.review-grade-guide dl>div{display:grid;grid-template-columns:max-content minmax(0,1fr);align-items:start;gap:10px;padding:8px 0;border-top:1px solid var(--line)}
    .review-grade-guide dt{color:var(--accent);font-weight:650}.review-grade-guide kbd{display:inline-grid;place-items:center;width:18px;margin-right:6px;border-radius:4px;background:var(--tint);font-size:11px}
    .review-grade-guide dd{margin:0;font-size:13px}.review-grade-guide dd .muted{display:block}
    .review-grade-guide .grade-note{border-top:1px solid var(--line);padding-top:8px}
    @media(prefers-color-scheme:dark){:host{--paper:#15201d;--surface:#1b2823;--ink:#e4ede5;--muted:#9aada1;--line:#304238;--accent:#9fd2b1;--tint:#263c30;--error:#f1a19b;color-scheme:dark}.primary,.launcher{background:#38684d;color:#fff;border-color:#497a5d}.primary:hover{background:#38684d}}
    @media(max-width:760px){.launcher{right:16px;bottom:16px}}
    @media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
  `;
  const app = el('div', 'app');
  style.textContent += `
    .toast{pointer-events:none}
    input,select{border:0;outline:none;box-shadow:none}
    .search-field{display:flex;align-items:center;flex:1;min-width:0;padding-right:3px;border-radius:12px;background:var(--surface)}
    .search-field:focus-within{background:var(--tint)}
    .search-field input,.search-field input:focus-visible{font-size:15px;line-height:27px;padding:8px 12px;background:transparent}
    .top .search{padding-right:14px;border-right:1px solid var(--line)}
    .top .search-button{position:relative;padding:4px 16px 4px 36px;border-radius:9px;font-weight:650;box-shadow:0 2px 6px #102a201c}
    .top .search-button::before{content:'';position:absolute;left:15px;top:50%;width:11px;height:11px;border:1.7px solid currentColor;border-radius:50%;transform:translateY(-60%)}
    .top .search-button::after{content:'';position:absolute;left:26px;top:calc(50% + 4px);width:5px;height:1.7px;border-radius:2px;background:currentColor;transform:rotate(45deg);transform-origin:left center}
    .top .close-studio{width:40px;height:40px;padding:0;border-color:transparent;background:transparent;color:var(--muted);font-size:22px;line-height:1}
    .top .close-studio:hover{background:var(--tint);color:var(--ink)}
    .list{gap:2px;margin-top:8px;padding:2px}
    .item{padding:6px 10px;border:0;border-radius:9px}
    .item .term{font-size:21px;line-height:1.2;overflow-wrap:anywhere}
    .item .meta{margin-top:2px;font-size:11px;line-height:1.4}
    .translation-copy{white-space:pre-line;line-height:1.85}
    .sentence-result{min-width:0;min-height:0;overflow:auto;overflow-wrap:anywhere}
    .sentence-heading{font-size:20px;margin:12px 0 18px}.sentence-original{white-space:pre-wrap;line-height:1.75;margin:0}
    .logo .version{font:11px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--muted);margin-left:6px;white-space:nowrap}
    .settings-version{display:none}
    .phonetic{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.phonetic .icon{border:0;background:transparent;transition:transform .12s,color .12s,opacity .12s}.phonetic .icon:active{transform:scale(.85);color:var(--accent);opacity:.6}.phonetic .link{font-size:11px}.phonetic .button{font-size:12px;padding:2px 8px}.review>.phonetic{justify-content:center}
    .word-forms dl{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:5px 16px;margin:6px 0 10px}.word-forms dt{color:var(--muted);font-size:12px}.word-forms dd{margin:0;overflow-wrap:anywhere}
    *{overscroll-behavior:contain}
    ::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:transparent}
    ::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--muted) 42%,transparent);border-radius:8px}
    ::-webkit-scrollbar-thumb:hover{background:color-mix(in srgb,var(--muted) 65%,transparent)}
    ::-webkit-scrollbar-button{display:none;width:0;height:0}
    @supports not selector(::-webkit-scrollbar){*{scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--muted) 42%,transparent) transparent}}
    .studio{grid-template-rows:minmax(0,1fr)}.main,.sidebar{min-height:0}.main{overflow:hidden}.sidebar{overflow:auto}.top{flex-shrink:0}
    .view.library{display:flex;flex-direction:column;overflow:hidden}.library>.heading,.library>.subheading{flex-shrink:0}
    .library .split{flex:1;min-height:0;grid-template-rows:minmax(0,1fr)}.library-list{display:flex;flex-direction:column;min-width:0;min-height:0}.library-list>.row{flex-shrink:0}.library-pagination{margin-top:8px}
    .library .list{flex:1;min-height:0;max-height:none}.detail-pane{overflow:auto;min-height:0;padding:3px 8px 3px 3px}
    .studio{position:relative}.library-detail,.library-sheet{display:flex;flex-direction:column;min-width:0;min-height:0}.library-sheet,.library-sheet>.detail-pane{flex:1}
    .library-sheet-bar,.library-sheet-nav{display:none}
    .list:focus-visible,.detail-pane:focus-visible{outline:2px solid #75ac8c;outline-offset:-2px}
    .library-row{position:relative;flex-shrink:0}.library-row>.item{padding-right:42px}
    .library-row:hover>.item{background:var(--surface)}.library-row:hover>.item.active{background:var(--tint)}
    .row-actions{position:absolute;right:5px;top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:2px}
    .detail-star,.list-star,.history-delete{border:0;background:transparent;padding:4px 7px;line-height:1;border-radius:8px}
    .detail-star:focus-visible,.list-star:focus-visible,.history-delete:focus-visible{outline-offset:0}
    .detail-star,.list-star{color:var(--muted);font-size:17px}.detail-star.starred,.list-star.starred{color:var(--accent)}
    .detail-star:hover,.list-star:hover{color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,transparent)}
    .word-heading{margin:8px 0 6px}.word-heading .word{margin:0;min-width:0}
    .detail-star{display:flex;align-items:center;justify-content:center;width:44px;height:44px;padding:0;font-size:32px}
    .history-delete{opacity:0;pointer-events:none}
    .history-delete:hover{background:color-mix(in srgb,var(--error) 12%,transparent)}
    @media(hover:none){.history-delete{opacity:1;pointer-events:auto}}
    .stats{flex-wrap:wrap}.stat{min-width:110px}
    .context-line{margin:14px auto 4px;max-width:480px;color:var(--muted);font:15px/1.7 Georgia,"Times New Roman",serif;overflow-wrap:anywhere}
    .context-line mark{background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--ink);border-radius:4px;padding:0 3px}
    .context-line .cloze{color:var(--accent);font-weight:650;letter-spacing:1px}
    .history-footprint{margin:10px 0 16px;border:1px solid var(--line);border-radius:10px;padding:8px 10px}
    .history-footprint>summary{cursor:pointer;color:var(--muted);font-size:12px}.history-entry{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:9px 0;border-top:1px solid var(--line)}
    .history-entry-content{min-width:0}.history-entry .history-delete{opacity:1;pointer-events:auto;flex-shrink:0}
    .history-context{margin:4px 0;color:var(--ink);font-size:13px;line-height:1.55;overflow-wrap:anywhere}
    .recall-prompt{text-align:left;background:var(--tint);border-radius:12px;padding:16px;margin:25px 0 6px}.recall-prompt .definition{margin:0 0 6px}
    .spelling{display:block;width:min(320px,100%);margin:6px auto 14px;text-align:center;font:20px Georgia,serif;background:var(--surface);border:1px solid var(--line)}
    .spell{font-weight:650}.spell.ok{color:var(--accent)}.spell.bad,.leech{color:var(--error)}
    .review-actions{justify-content:center;margin-top:14px}.review .actions{justify-content:center}
    .setting input.number,.setting input.reading-marker-seconds{width:80px;height:auto;text-align:right;border:1px solid var(--line)}
    .reading-marks{pointer-events:none;position:fixed;inset:0}.reading-mark{position:absolute;border-radius:3px}
    .reading-return{pointer-events:auto;position:fixed;left:12px;bottom:24px;z-index:1;box-shadow:0 5px 25px #0002}
    .fallback-setting{flex-wrap:wrap}.fallback-setting select{max-width:100%}
    .sync-field{display:block;max-width:420px;margin:12px 0}
    .sync-field input{display:block;min-height:44px;margin-top:4px;border:1px solid var(--line);background:var(--paper)}
    .sync-field input:focus-visible{border-color:var(--accent);background:var(--tint)}
    .lookup-back{min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis}.lookup-bar{margin-bottom:16px;gap:8px}
    .scope-menu{position:relative}.scope-menu summary{list-style:none;cursor:pointer}.scope-menu summary::-webkit-details-marker{display:none}
    .scope-actions{position:absolute;right:0;top:100%;z-index:1;width:190px;padding:8px;display:flex;flex-direction:column;gap:5px;background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:0 6px 20px #102a2025}
    .view.scope-view{display:flex;flex-direction:column;overflow:hidden}.scope-view>.heading,.scope-view>.subheading{flex-shrink:0}.scope-view>.subheading{margin-bottom:12px}
    .scope-manager{display:flex;flex-direction:column;gap:12px;flex:1;min-height:0}.scope-current{padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--surface);flex-shrink:0}
    .scope-current p{margin:0 0 5px}.scope-current .actions{margin-top:10px}.scope-help{font-size:12px;color:var(--muted);flex-shrink:0}.scope-help summary{cursor:pointer}
    .scope-toolbar{display:flex;align-items:center;gap:10px;flex-shrink:0}.scope-toolbar input{flex:1;min-width:0;font-size:13px}.scope-toolbar .meta{white-space:nowrap}
    .scope-rule-list{flex:1;min-height:0;overflow:auto;border-top:1px solid var(--line)}.scope-rule{display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid var(--line)}
    .scope-kind{flex-shrink:0;font-size:11px;color:var(--muted);background:var(--tint);border-radius:4px;padding:1px 5px}.scope-address{min-width:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}
    .scope-remove{font-size:12px;padding:3px 8px;border-color:transparent}.scope-pagination{display:flex;align-items:center;gap:8px;flex-shrink:0}.scope-pagination .meta{flex:1}.scope-pagination .button{font-size:12px;padding:5px 10px}.scope-pagination .button:disabled{cursor:default}
    .compact{--panel-bottom-gap:max(14px,env(safe-area-inset-bottom));--panel-height:min(680px,calc((var(--visible-height) - max(12px,env(safe-area-inset-top)) - var(--panel-bottom-gap)) * .86))}
    .compact .overlay{inset:auto;left:var(--visible-left);top:var(--visible-top);width:var(--visible-width);height:var(--visible-height);transform:scale(var(--ui-scale));transform-origin:top left;overflow:hidden;align-items:flex-end;background:#0d211f44;backdrop-filter:none;padding:max(12px,env(safe-area-inset-top)) max(18px,env(safe-area-inset-right)) var(--panel-bottom-gap) max(18px,env(safe-area-inset-left))}
    .compact .studio{width:min(600px,100%);height:var(--panel-height);border-radius:18px;grid-template:auto minmax(0,1fr) / minmax(0,1fr);outline:none;font-size:13px;line-height:1.5}
    .compact .sidebar{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:2px;overflow:visible;padding:4px 6px;border-right:0;border-bottom:1px solid var(--line)}
    .compact .sidebar .logo,.compact .sidebar .muted,.compact .sidebar .footnote{display:none}
    .compact .tab{min-height:40px;padding:0 2px;text-align:center;font-size:12px}
    .compact .top{padding:4px 8px;gap:4px}.compact .search input{padding:7px 8px;font-size:16px;line-height:1.5}.compact .search input::placeholder{font-size:13px}
    .compact .button,.compact .icon{min-height:36px}.compact .button{padding:5px 10px;font-size:13px}.compact .icon{min-width:36px}
    .compact .top .search{padding-right:5px}.compact .top .search-button::before,.compact .top .search-button::after{display:none}
    .compact .top .close-studio{width:36px;height:36px}
    .compact .selection-action{display:flex;align-items:center;gap:10px;width:min(340px,calc(var(--visible-width) - 24px));max-width:calc(var(--visible-width) - 24px);min-height:60px;padding:7px;border:1px solid var(--line);border-radius:18px;background:var(--surface);color:var(--ink);box-shadow:0 12px 30px #102a2030,0 2px 6px #102a2015;text-align:left;transform:scale(var(--ui-scale)) translateY(calc(0px - env(safe-area-inset-bottom)));transform-origin:top left}
    .compact .selection-action:hover{background:var(--surface);filter:none}
    .compact .selection-emblem{display:grid;place-items:center;flex:0 0 38px;height:38px;border-radius:12px;background:var(--tint);color:var(--accent);font:italic 24px/1 Georgia,serif}
    .compact .selection-summary{display:flex;flex:1;min-width:0;flex-direction:column;gap:3px;line-height:1.2}
    .compact .selection-caption{color:var(--ink);opacity:.7;font-size:10px;font-weight:650;letter-spacing:.04em}
    .compact .selection-preview{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:600 15px/1.3 Georgia,"Times New Roman",serif}
    .compact .selection-call{display:flex;align-items:center;justify-content:center;gap:8px;flex-shrink:0;min-width:82px;height:44px;padding:0 12px;border-radius:12px;background:var(--accent);color:var(--surface);font-size:13px;font-weight:650}
    .compact .selection-arrow{display:inline;font-size:16px;line-height:1}
    .compact .selection-action:active .selection-call{filter:brightness(1.12)}
    .compact .usage-examples>.button,.compact .popover-footer .button{min-height:44px}
    .compact .view{padding:10px;overflow:auto;overflow-wrap:anywhere}
    .compact .view.scope-view{display:block}.compact .view.library{display:flex}
    .compact .heading{font-size:18px}.compact .subheading{font-size:11px;margin:4px 0 8px}
    .compact .settings-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
    .compact .settings-version{display:block;padding:3px 8px;border-radius:6px;background:var(--tint);color:var(--ink);font:500 11px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0;white-space:nowrap}
    .compact .library .split{display:flex;flex-direction:column;min-height:220px}.compact .library-list{flex:1}.compact .library .list{max-height:none}
    .compact .library-row>.item{position:relative;min-height:44px;padding:4px 60px 4px 8px}
    .compact .library-row>.item::after{content:'›';position:absolute;right:42px;top:50%;transform:translateY(-50%);font-size:22px;color:var(--muted)}
    .compact .item .term{font-size:18px}.compact .item .meta{font-size:10px;line-height:1.3;margin-top:1px}
    .compact .row-actions .icon{min-width:32px;min-height:36px;padding:0}
    .compact .library-pagination{margin-top:6px;gap:6px}
    .compact .library-detail{position:absolute;inset:0;z-index:1;justify-content:flex-end;background:#0d211f66;overflow:hidden}
    .compact .library-sheet{flex:none;height:min(100%,max(300px,calc(var(--visible-height) * .64)));background:var(--paper);border:1px solid var(--line);border-radius:18px 18px 0 0;box-shadow:0 -8px 35px #081d2026;overflow:hidden;outline:none}
    .compact .library-sheet-bar,.compact .library-sheet-nav{display:flex;align-items:center;gap:8px;flex-shrink:0;padding:6px 12px;background:var(--surface)}
    .compact .library-sheet-bar{justify-content:space-between;border-bottom:1px solid var(--line)}.compact .library-sheet-bar strong{font-size:13px}
    .compact .library-sheet-nav{border-top:1px solid var(--line);padding-bottom:max(6px,env(safe-area-inset-bottom))}
    .compact .library-sheet-nav .meta{flex:1;text-align:center;margin:0}
    .compact .library-sheet-bar .button,.compact .library-sheet-nav .button{min-height:44px}
    .compact .library-sheet .button:disabled{cursor:default}
    .compact .detail-pane{overflow:auto;overscroll-behavior:contain;border:0;margin:0;padding:10px 12px}
    .compact .scope-rule-list{overflow:visible}
    .compact .section{padding:10px;margin:10px 0}.compact .section h3{font-size:14px;margin-bottom:10px}.compact .setting{gap:10px;margin:10px 0}
    .compact .empty{padding:10px 6px;font-size:12px}
    .compact .word{font-size:32px}.compact .phonetic{gap:6px;margin-bottom:8px}
    .compact .sense{padding-top:10px;margin-top:12px}.compact .definition{line-height:1.6;margin-bottom:8px}
    .compact .translation{padding:10px;margin-top:10px}.compact .translation-copy{line-height:1.65}
    .compact .source{margin-top:12px;padding-top:8px}.compact .lookup-bar{margin-bottom:10px}
    .compact .review{margin:10px auto}.compact .review .word{font-size:32px;margin:12px 0 8px}.compact .review-answer{margin:14px 0}
    .compact .review-grades{gap:6px}.compact .review-grades .button{padding-inline:0}
    .compact .review-grade-guide{padding:10px 12px}
    .compact .recall-prompt{padding:10px;margin:14px 0 6px}
    .compact .stats{gap:6px;margin:12px 0}.compact .stat{min-width:90px;padding:8px}.compact .stat strong{font-size:26px}
    .compact .popover{width:min(600px,calc(var(--visible-width) - max(18px,env(safe-area-inset-left)) - max(18px,env(safe-area-inset-right))));height:var(--panel-height);max-height:none;padding:14px;overflow-wrap:anywhere;transform:scale(var(--ui-scale)) translateY(calc(-100% - var(--panel-bottom-gap)));transform-origin:top left}
    .compact input:not([type="checkbox"]),.compact select{font-size:16px}
  `;
  let launcherPosition = get('launcher-position', null);
  if (!launcherPosition || !['x', 'y'].every(axis => Number.isFinite(launcherPosition[axis]) &&
    launcherPosition[axis] >= 0 && launcherPosition[axis] <= 1)) launcherPosition = null;
  let launcherDrag = null;
  let suppressLauncherClick = false;
  const launcher = button('L', () => { if (!suppressLauncherClick) openStudio(); }, 'launcher', '打开 Lexi 学习中心');
  launcher.title = '单击打开学习中心，拖动调整位置';
  const popover = el('section', 'popover');
  popover.tabIndex = -1;
  popover.setAttribute('role', 'region');
  popover.setAttribute('aria-label', 'Lexi 查词结果');
  popover.hidden = true;
  const overlay = el('div', 'overlay');
  overlay.hidden = true;
  const studio = el('section', 'studio');
  studio.tabIndex = -1;
  studio.setAttribute('role', 'dialog');
  studio.setAttribute('aria-modal', 'true');
  studio.setAttribute('aria-label', 'Lexi 学习中心');
  const sidebar = el('nav', 'sidebar');
  sidebar.setAttribute('aria-label', '学习导航');
  const logo = el('div', 'logo', 'Lexi');
  logo.append(el('span', 'version', 'v' + GM_info.script.version));
  sidebar.append(logo, el('div', 'muted', '个人词汇库'));
  const navButtons = {};
  for (const [key, label] of [['history', '查词历史'], ['book', '生词本'], ['review', '复习'], ['sites', '网页管理'], ['settings', '设置']]) {
    navButtons[key] = button(label, () => {
      const changed = screen !== key;
      screen = key;
      render();
      if (compact && changed) view.scrollTop = 0;
    }, 'tab');
    sidebar.append(navButtons[key]);
  }
  sidebar.append(el('div', 'footnote', '本地保存 · 无需账号'));
  const main = el('main', 'main');
  const top = el('header', 'top');
  const form = el('form', 'search');
  const input = el('input');
  input.placeholder = '输入英文单词或句子，按 Enter 查询';
  input.setAttribute('aria-label', '查询英文单词或句子');
  input.autocomplete = 'off';
  input.autocapitalize = 'none';
  input.spellcheck = false;
  input.enterKeyHint = 'search';
  const searchField = el('div', 'search-field');
  searchField.append(input, button('查询', () => lookup(input.value), 'button primary search-button'));
  form.append(searchField);
  form.addEventListener('submit', event => { event.preventDefault(); lookup(input.value).catch(showError); });
  top.append(form, button('×', closeStudio, 'icon close-studio', '关闭学习中心'));
  const view = el('div', 'view');
  view.tabIndex = -1;
  const toast = el('div', 'toast');
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.hidden = true;
  const readingMarks = el('div', 'reading-marks');
  readingMarks.setAttribute('aria-hidden', 'true');
  const readingReturn = button('回到原文', returnToReading, 'button reading-return');
  readingReturn.hidden = true;
  const selectionAction = button('', runSelectedAction, 'button primary selection-action');
  const selectionEmblem = el('span', 'selection-emblem', 'L');
  selectionEmblem.setAttribute('aria-hidden', 'true');
  const selectionSummary = el('span', 'selection-summary');
  const selectionPreview = el('span', 'selection-preview');
  selectionSummary.append(el('span', 'selection-caption', '已选内容'), selectionPreview);
  const selectionCall = el('span', 'selection-call');
  const selectionVerb = el('span', 'selection-verb', '查词');
  const selectionArrow = el('span', 'selection-arrow', '→');
  selectionArrow.setAttribute('aria-hidden', 'true');
  selectionCall.append(selectionVerb, selectionArrow);
  selectionAction.append(selectionEmblem, selectionSummary, selectionCall);
  selectionAction.hidden = true;
  selectionAction.addEventListener('pointerdown', event => event.preventDefault());
  selectionAction.addEventListener('mousedown', event => event.preventDefault());
  const readingStyle = el('style');
  const readingHighlightName = 'lexi-reading-origin';
  let readingMarker = null;
  let readingMarkerTimer;
  let readingFadeTimer;
  const readingObserver = typeof MutationObserver === 'function' ? new MutationObserver(updateReadingMarker) : null;
  main.append(top, view);
  studio.append(sidebar, main);
  overlay.append(studio);
  app.append(readingMarks, launcher, readingReturn, popover, overlay, selectionAction, toast);
  shadow.append(style, app);
  const visualViewport = window.visualViewport;
  const touchViewport = window.matchMedia?.('(pointer: coarse)');
  let visibleViewport = readViewport();
  let compact = false;
  function readViewport() {
    return {
      left: visualViewport?.offsetLeft || 0, top: visualViewport?.offsetTop || 0,
      width: visualViewport?.width || window.innerWidth, height: visualViewport?.height || window.innerHeight,
      scale: visualViewport?.scale || 1
    };
  }
  function updateViewport() {
    visibleViewport = readViewport();
    const { left, top, width, height, scale } = visibleViewport;
    const deviceWidth = width * scale;
    compact = deviceWidth <= 760 || Boolean(touchViewport?.matches && deviceWidth <= 1000 && height * scale <= 500);
    app.classList.toggle('compact', compact);
    if (compact) {
      // On desktop-width pages zoomed out by the mobile browser, size the UI in screen CSS pixels.
      const unit = Math.min(1, scale);
      app.style.setProperty('--visible-left', left + 'px');
      app.style.setProperty('--visible-top', top + 'px');
      app.style.setProperty('--visible-width', width * unit + 'px');
      app.style.setProperty('--visible-height', height * unit + 'px');
      app.style.setProperty('--ui-scale', 1 / unit);
    }
    librarySheet?.layout();
  }
  updateViewport();
  let toastTimer;
  function message(value) {
    toast.textContent = value;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
  }
  const showError = error => {
    const value = error?.message || '操作失败，请重试';
    if (host.isConnected) message(value); else alert(value);
  };
  function clearReadingMarker() {
    clearTimeout(readingMarkerTimer);
    clearTimeout(readingFadeTimer);
    readingObserver?.disconnect();
    if (readingMarker?.native) window.CSS.highlights.delete(readingHighlightName);
    readingMarker = null;
    readingStyle.remove();
    readingMarks.replaceChildren();
    readingReturn.hidden = true;
  }
  function paintReadingMarker(opacity) {
    if (!readingMarker) return;
    const color = `rgba(245,185,45,${opacity})`;
    if (readingMarker.native) readingStyle.textContent = `::highlight(${readingHighlightName}){background-color:${color}}`;
    else {
      readingMarker.color = color;
      for (const mark of readingMarks.children) mark.style.backgroundColor = color;
    }
  }
  function updateReadingMarker() {
    if (!readingMarker) return;
    const { range, text: original, native } = readingMarker;
    if (!range.startContainer.isConnected || !range.endContainer.isConnected || range.collapsed || range.toString() !== original) {
      clearReadingMarker();
      return;
    }
    let bounds = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    for (let node = range.startContainer.parentElement; node; node = node.parentElement) {
      const css = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(css.overflowX)) {
        bounds.left = Math.max(bounds.left, rect.left);
        bounds.right = Math.min(bounds.right, rect.right);
      }
      if (/(auto|scroll|hidden|clip)/.test(css.overflowY)) {
        bounds.top = Math.max(bounds.top, rect.top);
        bounds.bottom = Math.min(bounds.bottom, rect.bottom);
      }
    }
    const rects = [...range.getClientRects()].map(rect => ({
      left: Math.max(bounds.left, rect.left), top: Math.max(bounds.top, rect.top),
      right: Math.min(bounds.right, rect.right), bottom: Math.min(bounds.bottom, rect.bottom)
    })).filter(rect => rect.right > rect.left && rect.bottom > rect.top);
    readingReturn.hidden = !overlay.hidden || rects.length > 0;
    if (native) return;
    readingMarks.replaceChildren(...rects.map(rect => {
      const mark = el('span', 'reading-mark');
      Object.assign(mark.style, {
        left: rect.left + 'px', top: rect.top + 'px', width: (rect.right - rect.left) + 'px',
        height: (rect.bottom - rect.top) + 'px', backgroundColor: readingMarker.color
      });
      return mark;
    }));
  }
  function holdReadingMarker() {
    if (!readingMarker) return;
    clearTimeout(readingMarkerTimer);
    clearTimeout(readingFadeTimer);
    paintReadingMarker(0.3);
    updateReadingMarker();
  }
  function captureReadingMarker(range, transient = false) {
    clearReadingMarker();
    const native = Boolean(window.CSS?.highlights && typeof window.Highlight === 'function');
    readingMarker = { range: range.cloneRange(), text: range.toString(), native, transient };
    if (native) {
      window.CSS.highlights.set(readingHighlightName, new window.Highlight(readingMarker.range));
      document.documentElement.append(readingStyle);
    }
    holdReadingMarker();
    readingObserver?.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }
  function releaseReadingMarker() {
    if (!readingMarker) return;
    const duration = cleanSettings(get('settings', {})).readingMarkerSeconds * 1000;
    if (!duration) { clearReadingMarker(); return; }
    holdReadingMarker();
    paintReadingMarker(0.5);
    const expires = Date.now() + duration;
    const fade = () => {
      if (!readingMarker) return;
      paintReadingMarker(0.5 * Math.max(0, Math.min(1, (expires - Date.now()) / 240)));
      readingFadeTimer = setTimeout(fade, 40);
    };
    readingFadeTimer = setTimeout(fade, Math.max(0, duration - 240));
    readingMarkerTimer = setTimeout(clearReadingMarker, duration);
  }
  function returnToReading() {
    updateReadingMarker();
    if (!readingMarker) { message('原文内容已变化，无法定位查词位置'); return; }
    const { range } = readingMarker;
    const element = range.startContainer.parentElement;
    element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    // Center the actual word even inside a long paragraph or nested reading pane.
    for (let node = element; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
      const css = getComputedStyle(node);
      const bounds = node.getBoundingClientRect(), rect = range.getBoundingClientRect();
      if (/(auto|scroll)/.test(css.overflowY)) node.scrollTop += rect.top + rect.height / 2 - bounds.top - bounds.height / 2;
      if (/(auto|scroll)/.test(css.overflowX)) node.scrollLeft += rect.left + rect.width / 2 - bounds.left - bounds.width / 2;
    }
    const rect = range.getBoundingClientRect();
    window.scrollBy({
      top: rect.top + rect.height / 2 - window.innerHeight / 2,
      left: rect.left < 0 || rect.right > window.innerWidth ? rect.left + rect.width / 2 - window.innerWidth / 2 : 0,
      behavior: 'instant'
    });
    if (!popover.hidden) closePopover();
    else releaseReadingMarker();
    updateReadingMarker();
  }
  function positionLauncher(position = launcherPosition) {
    if (!position) {
      launcher.style.left = launcher.style.top = launcher.style.right = launcher.style.bottom = '';
      return;
    }
    if (!host.isConnected || launcher.hidden) return;
    const rect = launcher.getBoundingClientRect();
    launcher.style.left = Math.max(0, window.innerWidth - rect.width) * position.x + 'px';
    launcher.style.top = Math.max(0, window.innerHeight - rect.height) * position.y + 'px';
    launcher.style.right = launcher.style.bottom = 'auto';
  }
  function finishLauncherDrag(event) {
    if (!launcherDrag || event && event.pointerId !== launcherDrag.pointerId) return;
    const drag = launcherDrag;
    launcherDrag = null;
    launcher.classList.toggle('dragging', false);
    if (launcher.hasPointerCapture(drag.pointerId)) launcher.releasePointerCapture(drag.pointerId);
    if (!drag.position) return;
    if (event?.type === 'pointerup') {
      try {
        put('launcher-position', drag.position);
        launcherPosition = drag.position;
      } catch (error) {
        positionLauncher();
        showError(new Error('入口位置保存失败：' + (error?.message || '请重试')));
      }
    } else positionLauncher();
  }
  launcher.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.isPrimary === false || launcherDrag) return;
    suppressLauncherClick = false;
    const rect = launcher.getBoundingClientRect();
    launcher.setPointerCapture(event.pointerId);
    launcherDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, rect };
  });
  launcher.addEventListener('pointermove', event => {
    const drag = launcherDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.position && Math.hypot(dx, dy) < 5) return;
    event.preventDefault();
    suppressLauncherClick = true;
    launcher.classList.toggle('dragging', true);
    const maxX = Math.max(0, window.innerWidth - drag.rect.width);
    const maxY = Math.max(0, window.innerHeight - drag.rect.height);
    drag.position = {
      x: maxX ? Math.max(0, Math.min(maxX, drag.rect.left + dx)) / maxX : 0,
      y: maxY ? Math.max(0, Math.min(maxY, drag.rect.top + dy)) / maxY : 0
    };
    positionLauncher(drag.position);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) launcher.addEventListener(type, finishLauncherDrag);
  launcher.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') suppressLauncherClick = false;
  });
  positionLauncher();
  function stopQuery() {
    queryEpoch++;
    activeRequest?.abort();
    activeRequest = null;
    const cancel = cancelSentence;
    cancelSentence = null;
    cancel?.();
  }
  function stopAudio() {
    audioEpoch++;
    activeAudio?.pause();
    activeAudio = null;
    if (ownSpeech) window.speechSynthesis?.cancel();
    ownSpeech = false;
  }
  function closePopover(keepReading = false) {
    const wasOpen = !popover.hidden;
    resetInternalLookup(); cancelInternalSelection(); popover.hidden = true; stopQuery(); stopAudio();
    clearSelectionAction();
    if (popover.querySelector('.sentence-result')) popover.replaceChildren();
    if (wasOpen && readingMarker?.transient) {
      clearReadingMarker();
    } else if (wasOpen && !keepReading) releaseReadingMarker();
    if (wasOpen && lastSelectionTransient) {
      lastSelection = ''; lastSelectionAt = 0; lastSelectionTransient = false;
    }
  }
  function openStudio(nextScreen) {
    updateViewport();
    clearSelectionAction();
    returnFocus = shadow.activeElement || document.activeElement;
    closePopover(true);
    if (nextScreen) screen = nextScreen;
    overlay.hidden = false;
    holdReadingMarker();
    render();
    if (nextScreen === 'settings' || nextScreen === 'sites') view.scrollTop = 0;
    if (!studio.contains(shadow.activeElement)) focusStudio();
  }
  function focusStudio() {
    (librarySheet?.open ? librarySheet.panel : compact ? studio : input).focus({ preventScroll: true });
  }
  function closeStudio() {
    resetInternalLookup();
    librarySheet?.close(false);
    cancelInternalSelection();
    clearSelectionAction();
    if (classifyQuery(input.value)?.type === 'sentence') input.value = '';
    overlay.hidden = true;
    releaseReadingMarker();
    clearTimeout(reviewTimer);
    stopQuery();
    stopAudio();
    if (returnFocus?.getClientRects().length) returnFocus.focus?.();
    else if (!currentSite.disabled) launcher.focus();
    if (currentSite.disabled) host.remove();
  }
  function stopActivity() {
    finishLauncherDrag();
    activityEpoch++;
    clearTimeout(selectionTimer);
    clearTimeout(toastTimer);
    clearTimeout(reviewTimer);
    clearSelectionAction();
    closePopover();
    clearReadingMarker();
    stopAudio();
    for (const request of requests) request.abort();
    toast.hidden = true;
  }
  function applySite(changed) {
    launcher.hidden = currentSite.disabled;
    if (changed) {
      stopActivity();
      lastSelection = ''; lastSelectionAt = 0; lastSelectionTransient = false;
      if (currentSite.disabled) {
        closeStudio();
        host.remove();
      } else if (!overlay.hidden) render();
    }
    if (!currentSite.disabled && !host.isConnected) document.documentElement.append(host);
    if (!currentSite.disabled) positionLauncher();
  }
  function refresh(force = false) {
    settings = cleanSettings(get('settings', {}));
    if (!internalLookup && !overlay.hidden && (force || !studio.contains(shadow.activeElement))) render();
  }
  function checkActivity(epoch) {
    syncSite();
    if (epoch !== activityEpoch) throw new Error('查询已取消');
  }
  overlay.addEventListener('click', event => { if (event.target === overlay) closeStudio(); });
  function containWheel(event) {
    event.stopPropagation();
    if (event.ctrlKey) return;
    const path = event.composedPath();
    const canScroll = path.slice(0, path.indexOf(event.currentTarget) + 1).some(node => {
      if (!(node instanceof Element)) return false;
      const style = getComputedStyle(node);
      return /^(auto|scroll)$/.test(style.overflowY) && (event.deltaY < 0 ? node.scrollTop > 0
        : event.deltaY > 0 && node.scrollTop + node.clientHeight < node.scrollHeight - 1)
        || /^(auto|scroll)$/.test(style.overflowX) && (event.deltaX < 0 ? node.scrollLeft > 0
          : event.deltaX > 0 && node.scrollLeft + node.clientWidth < node.scrollWidth - 1);
    });
    if (!canScroll) event.preventDefault();
  }
  overlay.addEventListener('wheel', containWheel, { passive: false });
  popover.addEventListener('wheel', containWheel, { passive: false });
  shadow.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (internalSelectionTimer) cancelInternalSelection();
      else if (internalLookup) returnInternalLookup();
      else if (librarySheet?.open) librarySheet.close();
      else if (!overlay.hidden && closeReviewGradeGuide()) return;
      else overlay.hidden ? closePopover() : closeStudio();
      return;
    }
    if (!internalLookup && !internalSelectionTimer && !overlay.hidden && screen === 'review' && review.active && !event.altKey && !event.repeat) {
      let handled = false;
      try { handled = reviewKey(event); } catch (error) { handled = true; showError(error); }
      if (handled) { event.preventDefault(); event.stopPropagation(); return; }
    }
    if (event.key !== 'Tab' || overlay.hidden) return;
    const focusScope = librarySheet?.open ? librarySheet.panel : studio;
    const focusable = [...focusScope.querySelectorAll('button,a,input,select,[tabindex="0"]')].filter(node => !node.disabled && node.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (!focusable.includes(shadow.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
    else if (event.shiftKey && shadow.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && shadow.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (!popover.hidden) closePopover();
      else clearSelectionAction();
    }
  });

  function request(url, lookupRequest = false, noCache = false, body) {
    syncSite();
    if (currentSite.disabled && overlay.hidden) throw new Error('当前网页已禁用，查询已取消');
    const epoch = activityEpoch;
    let timer;
    let handle;
    let cancel;
    const tracked = { abort: () => { cancel(new Error('查询已取消')); handle?.abort(); } };
    requests.add(tracked);
    const pending = new Promise((resolve, reject) => {
      cancel = reject;
      // Anonymous requests force fetch mode, whose native timeout is ignored on Chrome.
      timer = setTimeout(() => { reject(new Error('请求超时，请稍后重试')); handle?.abort(); }, 10000);
      handle = GM_xmlhttpRequest({
        method: body === undefined ? 'GET' : 'POST', url, timeout: 10000, anonymous: true,
        ...(body === undefined ? {} : { data: body, headers: { 'Content-Type': 'application/json' } }),
        ...(noCache ? { nocache: true } : {}),
        onload: response => {
          try { checkActivity(epoch); } catch (error) { reject(error); return; }
          if (response.status === 404 && !noCache) { reject(new Error('没有找到这个词，试试原形或其他拼写')); return; }
          if (response.status < 200 || response.status >= 300) { reject(new Error(`服务暂不可用（${response.status}），请稍后重试`)); return; }
          try {
            if (response.responseText.length > 300000) throw new Error('服务响应过大');
            resolve(JSON.parse(response.responseText));
          } catch { reject(new Error('服务返回格式异常，请稍后重试')); }
        },
        onerror: () => reject(new Error('网络连接失败，请检查网络或稍后重试')),
        ontimeout: () => reject(new Error('请求超时，请稍后重试')),
        onabort: () => reject(new Error('查询已取消'))
      });
      if (lookupRequest) activeRequest = tracked;
    });
    return pending.finally(() => { clearTimeout(timer); requests.delete(tracked); });
  }
  function positionPopover(rect, keepPosition = false) {
    popover.hidden = false;
    if (compact) {
      const { left, top, width, height } = visibleViewport;
      popover.style.left = left + (width - popover.getBoundingClientRect().width) / 2 + 'px';
      popover.style.top = top + height + 'px';
      return;
    }
    const viewport = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const gap = 12;
    const { width, height } = popover.getBoundingClientRect();
    const maxLeft = Math.max(viewport.left + gap, viewport.left + viewport.width - width - gap);
    const maxTop = Math.max(viewport.top + gap, viewport.top + viewport.height - height - gap);
    const anchorTop = rect?.top ?? viewport.top + 80;
    const below = (rect?.bottom ?? anchorTop) + 10;
    const top = below <= maxTop ? below : anchorTop - height - 10;
    const currentLeft = keepPosition ? parseFloat(popover.style.left) : NaN;
    const currentTop = keepPosition ? parseFloat(popover.style.top) : NaN;
    popover.style.left = Math.max(viewport.left + gap, Math.min(maxLeft, Number.isFinite(currentLeft) ? currentLeft : rect?.left ?? maxLeft - gap)) + 'px';
    popover.style.top = Math.max(viewport.top + gap, Math.min(maxTop, Number.isFinite(currentTop) ? currentTop : top)) + 'px';
  }
  function popHeader() {
    const bar = el('div', 'bar');
    const actions = el('div', 'actions');
    actions.append(scopeMenu(), button('×', closePopover, 'icon', '关闭查词卡'));
    bar.append(el('span', 'brand', 'LEXI · 英语词典'), actions);
    return bar;
  }
  function scopeMenu() {
    const details = el('details', 'scope-menu');
    const summary = el('summary', 'icon', '⋯');
    summary.setAttribute('aria-label', '网页启用范围');
    const actions = el('div', 'scope-actions');
    for (const [type, label] of [['page', '禁用此页面'], ['domain', '禁用此域名…']]) {
      actions.append(button(label, () => changeSiteRule({ type, value: pageScope(location.href)[type] }, true)));
    }
    actions.append(button('网页启用范围…', () => openStudio('sites')));
    details.append(summary, actions);
    return details;
  }
  function cancelInternalSelection() {
    clearTimeout(internalSelectionTimer);
    internalSelectionTimer = undefined;
  }
  function rememberSelectionPointer(event) {
    if (event?.pointerType) lastSelectionPointerType = event.pointerType;
  }
  function usesSelectionAction(event) {
    rememberSelectionPointer(event);
    return ['touch', 'pen'].includes(event?.pointerType || lastSelectionPointerType)
      || (!event?.pointerType && !lastSelectionPointerType && Boolean(touchViewport?.matches));
  }
  function clearSelectionAction() {
    clearTimeout(selectionActionRefreshTimer);
    selectionActionRefreshTimer = undefined;
    pendingSelection = null;
    selectionAction.hidden = true;
    selectionPreview.textContent = '';
    selectionAction.removeAttribute('aria-label');
    launcher.classList.toggle('selection-active', false);
    launcher.inert = false;
    launcher.removeAttribute('aria-hidden');
  }
  function positionSelectionAction(range) {
    selectionAction.hidden = false;
    launcher.classList.toggle('selection-active', compact);
    launcher.inert = compact;
    if (compact) launcher.setAttribute('aria-hidden', 'true');
    else launcher.removeAttribute('aria-hidden');
    const viewport = compact ? visibleViewport : {
      left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, scale: 1
    };
    const unit = Math.min(1, viewport.scale);
    const gap = 8 / unit;
    const { width, height } = selectionAction.getBoundingClientRect();
    const minLeft = viewport.left + gap;
    const minTop = viewport.top + gap;
    const maxLeft = Math.max(minLeft, viewport.left + viewport.width - width - gap);
    const maxTop = Math.max(minTop, viewport.top + viewport.height - height - gap);
    if (compact) {
      selectionAction.style.left = Math.max(minLeft, Math.min(maxLeft, viewport.left + (viewport.width - width) / 2)) + 'px';
      selectionAction.style.top = Math.max(minTop, maxTop) + 'px';
      return;
    }
    const bounds = range.getBoundingClientRect();
    const above = bounds.top - height - gap;
    const top = above >= minTop ? above : bounds.bottom + gap;
    selectionAction.style.left = Math.max(minLeft, Math.min(maxLeft, bounds.left)) + 'px';
    selectionAction.style.top = Math.max(minTop, Math.min(maxTop, top)) + 'px';
  }
  function readingElement(node) {
    const element = node instanceof Element ? node : node?.parentElement;
    if (!element || element.closest('button,a,input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return null;
    return element.closest('.word,.definition,.example,.translation-copy,.word-forms,.context,.context-line,.recall-prompt,.sentence-original');
  }
  function selectedInternalQuery() {
    const selection = typeof shadow.getSelection === 'function' ? shadow.getSelection() : window.getSelection();
    if (!selection) return;
    let range;
    if (typeof selection.getComposedRanges === 'function') {
      const [composed] = selection.getComposedRanges({ shadowRoots: [shadow] });
      if (!composed || !shadow.contains(composed.startContainer) || !shadow.contains(composed.endContainer)) return;
      range = document.createRange();
      range.setStart(composed.startContainer, composed.startOffset);
      range.setEnd(composed.endContainer, composed.endOffset);
    } else {
      if (!selection.rangeCount) return;
      range = selection.getRangeAt(0);
    }
    if (range.collapsed || !shadow.contains(range.startContainer) || !shadow.contains(range.endContainer)) return;
    const start = readingElement(range.startContainer);
    if (!start || start !== readingElement(range.endContainer)) return;
    const target = start.closest('.popover,.detail-pane,.view');
    if (!target || target.hidden || !target.getClientRects().length || (target !== popover && overlay.hidden)) return;
    const query = classifyQuery(range.toString());
    if (!query || query.type === 'word' && query.value === normalize(target.querySelector('.word')?.textContent)) return;
    return { selection, range, query, target };
  }
  function selectedWebsiteQuery() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (range.collapsed || host.contains(range.startContainer) || host.contains(range.endContainer)) return;
    const anchor = selection.anchorNode?.parentElement;
    if (anchor?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
    const query = classifyQuery(selection.toString());
    if (!query) return;
    return { selection, range, query, target: null, anchor };
  }
  function currentSelectionQuery() {
    return selectedInternalQuery() || selectedWebsiteQuery();
  }
  function updateSelectionAction() {
    if (selectionPointerDown || !usesSelectionAction()) return;
    const selected = currentSelectionQuery();
    if (!selected) { clearSelectionAction(); return; }
    if (selected.target && selected.query.type === 'word' &&
      selected.query.value === normalize(selected.target.querySelector('.word')?.textContent)) {
      clearSelectionAction();
      return;
    }
    pendingSelection = { ...selected, range: selected.range.cloneRange() };
    const isWord = selected.query.type === 'word';
    const preview = selected.range.toString().replace(/\s+/g, ' ').trim();
    selectionPreview.textContent = preview.length > 120 ? preview.slice(0, 120) + '…' : preview;
    selectionVerb.textContent = isWord ? '查词' : '翻译';
    selectionAction.setAttribute('aria-label', isWord ? `查词 ${selected.query.value}` : '翻译所选句子');
    selectionAction.disabled = selected.query.type === 'sentence' && selected.query.value.length > MAX_SENTENCE_LENGTH;
    positionSelectionAction(selected.range);
  }
  function scheduleSelectionActionUpdate() {
    if (selectionAction.hidden || selectionPointerDown) return;
    clearTimeout(selectionActionRefreshTimer);
    selectionActionRefreshTimer = setTimeout(() => {
      selectionActionRefreshTimer = undefined;
      updateSelectionAction();
    }, 0);
  }
  function selectedContext(selected) {
    if (selected.query.type !== 'word' || !settings.context || !selected.anchor) return null;
    const raw = selected.query.value;
    const block = selected.anchor.closest('p,li,td,blockquote,figcaption') || selected.anchor;
    const body = block?.textContent || '';
    const index = body.toLowerCase().indexOf(raw.toLowerCase());
    const url = new URL(location.href); url.search = ''; url.hash = '';
    return {
      context: body.slice(Math.max(0, index - 90), Math.max(0, index - 90) + 300).replace(/\s+/g, ' '),
      title: text(document.title, 120), sourceUrl: safeUrl(url.href)
    };
  }
  function runSelectedAction() {
    const selected = currentSelectionQuery();
    clearSelectionAction();
    if (!selected) { message('选区已失效，请重新选择'); return; }
    if (selected.query.type === 'sentence' && selected.query.value.length > MAX_SENTENCE_LENGTH) {
      message(`英文翻译最多支持 ${MAX_SENTENCE_LENGTH} 个字符，请缩短后重试`);
      return;
    }
    if (selected.target) {
      selected.selection.removeAllRanges();
      beginInternalLookup(selected.query.value, selected.target);
      return;
    }
    const rect = selected.range.getBoundingClientRect();
    const context = selectedContext(selected);
    captureReadingMarker(selected.range, selected.query.type === 'sentence');
    selected.selection.removeAllRanges();
    lookup(selected.query.value, rect, context).catch(showError);
  }
  function lookupInternalSelection() {
    cancelInternalSelection();
    const selected = selectedInternalQuery();
    if (!selected) return;
    selected.selection.removeAllRanges();
    if (selected.query.type === 'sentence' && selected.query.value.length > MAX_SENTENCE_LENGTH) {
      message(`英文翻译最多支持 ${MAX_SENTENCE_LENGTH} 个字符，请缩短后重试`);
      return;
    }
    beginInternalLookup(selected.query.value, selected.target);
  }
  function scheduleInternalSelection() {
    cancelInternalSelection();
    if (internalPointerDown) return;
    try {
      if (usesSelectionAction()) {
        updateSelectionAction();
        return;
      }
      clearSelectionAction();
      if (selectedInternalQuery()) internalSelectionTimer = setTimeout(() => {
        try { lookupInternalSelection(); } catch (error) { showError(error); }
      }, 220);
    } catch (error) { showError(error); }
  }
  shadow.addEventListener('pointerup', event => {
    rememberSelectionPointer(event);
    internalPointerDown = false;
    if (event.button === 0) scheduleInternalSelection();
  });
  shadow.addEventListener('keyup', event => { if (event.key.startsWith('Arrow') || event.key === 'Shift') scheduleInternalSelection(); });
  shadow.addEventListener('pointerdown', event => {
    rememberSelectionPointer(event);
    cancelInternalSelection();
    const reading = readingElement(event.composedPath()[0]);
    internalPointerDown = event.button === 0 && Boolean(reading);
    if (event.button === 0 && !reading && !event.composedPath().includes(selectionAction)) {
      selectedInternalQuery()?.selection.removeAllRanges();
    }
  });
  shadow.addEventListener('scroll', cancelInternalSelection, true);
  shadow.addEventListener('selectionchange', scheduleInternalSelection);
  document.addEventListener('selectionchange', () => {
    scheduleInternalSelection();
    scheduleSelectionActionUpdate();
  });

  function navigationFrame(target) {
    return {
      nodes: [...target.childNodes], word: target.querySelector('.word')?.textContent ||
        (target.querySelector('.sentence-result') ? '句子翻译' : screen === 'review' ? '复习' : '学习中心'),
      focus: shadow.activeElement,
      scroll: [target, ...target.querySelectorAll('div,article,section')].map(node => ({ node, top: node.scrollTop, left: node.scrollLeft }))
    };
  }
  function restoreFrame(target, frame) {
    target.replaceChildren(...frame.nodes);
    for (const { node, top, left } of frame.scroll) { node.scrollTop = top; node.scrollLeft = left; }
    refreshStarButtons();
  }
  function resetInternalLookup() {
    if (!internalLookup) return;
    const { target, frames } = internalLookup;
    internalLookup = null;
    stopQuery(); stopAudio();
    restoreFrame(target, frames[0]);
  }
  function returnInternalLookup() {
    cancelInternalSelection();
    stopQuery(); stopAudio();
    const { target, frames } = internalLookup;
    const frame = frames.pop();
    if (!frames.length) internalLookup = null;
    restoreFrame(target, frame);
    if (compact && target === popover) positionPopover(null, true);
    if (frame.focus?.getClientRects().length) frame.focus.focus({ preventScroll: true });
    else (target.querySelector('.lookup-back') || target).focus({ preventScroll: true });
  }
  function beginInternalLookup(raw, target) {
    if (internalLookup && internalLookup.target !== target) resetInternalLookup();
    if (!internalLookup) internalLookup = { target, frames: [] };
    internalLookup.frames.push(navigationFrame(target));
    cancelInternalSelection();
    stopAudio();
    lookup(raw, null, null, target).catch(showError);
    target.querySelector('.lookup-back')?.focus({ preventScroll: true });
  }
  function internalResult(target, ...nodes) {
    const focused = target.contains(shadow.activeElement);
    const bar = el('div', 'bar lookup-bar');
    bar.append(button('← 返回 ' + internalLookup.frames.at(-1).word, returnInternalLookup, 'button lookup-back'));
    if (target === popover) bar.append(scopeMenu(), button('×', closePopover, 'icon', '关闭查词卡'));
    target.replaceChildren(bar, ...nodes);
    target.scrollTop = 0;
    if (target === popover) positionPopover(null, true);
    if (focused) bar.querySelector('button').focus({ preventScroll: true });
  }
  function preserveWordEnrichment(fresh) {
    const cached = get('word:' + fresh.word);
    if (cached?.wordForms) fresh.wordForms = cached.wordForms;
    if (cached?.examples) Object.assign(fresh, { examples: cached.examples, examplesFetchedAt: cached.examplesFetchedAt });
    if (cached?.youdaoTranslation) Object.assign(fresh, {
      youdaoTranslation: cached.youdaoTranslation, youdaoTranslatedAt: cached.youdaoTranslatedAt
    });
    if (cached?.phonetic?.trim() && (cached.phoneticSource === 'youdao' || !fresh.phonetic)) {
      fresh.phonetic = cached.phonetic;
      if (cached.phoneticSource) fresh.phoneticSource = cached.phoneticSource;
    }
    if (cached?.translation && translationMatches(cached, fresh)) {
      Object.assign(fresh, {
        translation: cached.translation, translatedAt: cached.translatedAt,
        ...(cached.translationSource ? { translationSource: cached.translationSource } : {}),
        ...(cached.translationProvider ? { translationProvider: cached.translationProvider } : {})
      });
    }
    return fresh;
  }
  async function lookup(raw, rect, context = null, target = null) {
    syncSite();
    if (currentSite.disabled && overlay.hidden) { message('当前网页已禁用，请从油猴菜单手动打开学习中心'); return; }
    const query = classifyQuery(raw);
    if (!query) { message('请输入英文单词，或包含多个英文词的短语、句子'); return; }
    if (query.type === 'sentence') {
      if (query.value.length > MAX_SENTENCE_LENGTH) {
        message(`英文翻译最多支持 ${MAX_SENTENCE_LENGTH} 个字符，请缩短后重试`);
        return;
      }
      if (!target && !overlay.hidden) {
        input.value = '';
        beginInternalLookup(query.value, view);
        return;
      }
      return translateSentence(query.value, rect, target);
    }
    const word = query.value;
    if (!target) { resetInternalLookup(); cancelInternalSelection(); }
    stopQuery();
    const epoch = queryEpoch;
    const current = () => { syncSite(); return epoch === queryEpoch; };
    const showPopup = !target && overlay.hidden;
    if (target) internalResult(target, el('h2', 'word', word), el('p', 'muted', '正在查词…'));
    else if (showPopup) {
      popover.replaceChildren(popHeader(), el('h2', 'word', word), el('p', 'muted', '正在查词…'));
      positionPopover(rect);
    } else message(`正在查询 ${word}…`);
    let entry = get('word:' + word);
    let stale = false;
    try {
      if (!entry || Date.now() - entry.fetchedAt > 7 * DAY) {
        try {
          const response = await request('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word), true);
          if (!current()) return;
          entry = preserveWordEnrichment(dictionary(response, word, Date.now()));
        } catch (error) {
          if (!current()) return;
          if (!entry) throw error;
          stale = true;
        }
      }
      if (!current()) return;
      put('word:' + word, entry);
      const now = Date.now();
      const event = { id: crypto.randomUUID(), word, at: now, ...(context || {}) };
      put('event:' + event.id, event);
      settings = cleanSettings(get('settings', {}));
      if (settings.autoBook && !get('study:' + word)) put('study:' + word, createStudy(word, now));
      if (!target) selectedWord = word;
      notify();
      if (target) {
        internalResult(target, wordDetail(entry, event));
        if (stale) target.append(el('p', 'notice', '使用离线缓存 · 暂未能更新释义'));
        refreshLibrary?.();
      } else if (showPopup) {
        popover.replaceChildren(popHeader(), wordDetail(entry, event));
        if (stale) popover.append(el('p', 'notice', '使用离线缓存 · 暂未能更新释义'));
        const footer = el('footer', 'popover-footer');
        footer.append(button('打开学习中心 ↗', () => openStudio('history'), 'button'));
        popover.append(footer);
        positionPopover(rect);
      } else {
        if (toast.textContent === `正在查询 ${word}…`) toast.hidden = true;
        screen = 'history';
        Object.assign(libraryState.history, { filter: '', page: 0 });
        render();
        if (compact) {
          view.scrollTop = 0;
          librarySheet.show();
        }
        if (stale) message('使用离线缓存 · 暂未能更新释义');
      }
    } catch (error) {
      if (!current()) return;
      if (target) {
        internalResult(target, el('h2', 'word', word), el('p', 'error', error.message),
          button('重试', () => lookup(word, rect, context, target)));
      } else if (showPopup) {
        popover.replaceChildren(popHeader(), el('h2', 'word', word), el('p', 'error', error.message),
          button('重试', () => lookup(word, rect, context)));
        positionPopover(rect);
      } else showError(error);
    } finally { if (epoch === queryEpoch) activeRequest = null; }
  }
  async function translateSentence(source, rect, target) {
    if (!target) { resetInternalLookup(); cancelInternalSelection(); }
    stopQuery();
    const epoch = queryEpoch;
    const activity = activityEpoch;
    const current = () => { syncSite(); return epoch === queryEpoch; };
    const check = () => {
      checkActivity(activity);
      if (epoch !== queryEpoch) throw new Error('查询已取消');
    };
    const panel = el('article', 'sentence-result');
    const original = el('p', 'sentence-original', source);
    original.setAttribute('lang', 'en');
    const output = el('section', 'translation');
    output.setAttribute('aria-live', 'polite');
    panel.append(el('h2', 'sentence-heading', '英文翻译'), el('div', 'pos', '原文'), original,
      output, el('p', 'notice', '仅本次显示，原文和译文不会保存'));
    output.append(el('div', 'pos', '中文译文'), el('p', 'muted', '正在翻译…'));
    const retry = () => translateSentence(source, rect, target);
    cancelSentence = () => output.replaceChildren(el('div', 'pos', '中文译文'),
      el('p', 'notice', '翻译已取消，可重试'), button('重试', retry));
    if (target) internalResult(target, panel);
    else {
      popover.replaceChildren(popHeader(), panel);
      positionPopover(rect);
    }
    try {
      const { translation, translationProvider, failures } = await sentenceTranslation(source, check);
      check();
      const translated = el('div', 'translation-copy', translation);
      translated.setAttribute('lang', 'zh-CN');
      const providerLabel = sentenceProviderLabels[translationProvider];
      output.replaceChildren(el('div', 'pos', `中文译文 · ${providerLabel}${failures.length ? '（备用）' : ''}`), translated);
      if (failures.length) output.append(el('p', 'notice',
        `${failures.map(({ provider, error }) => `${sentenceProviderLabels[provider]}：${error.message}`).join('；')}；已使用 ${providerLabel} 备用翻译`));
    } catch (error) {
      if (!current()) return;
      output.replaceChildren(el('div', 'pos', '中文译文'), el('p', 'error', error.message),
        button('重试', retry));
    } finally {
      if (epoch === queryEpoch) {
        activeRequest = null;
        cancelSentence = null;
        if (!target) positionPopover(rect);
        else if (target === popover) positionPopover(null, true);
      }
    }
  }
  function speak(entry) {
    stopAudio();
    const epoch = audioEpoch;
    const fallback = () => {
      if (epoch !== audioEpoch) return;
      if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') { message('当前浏览器没有可用的朗读功能'); return; }
      const utterance = new SpeechSynthesisUtterance(entry.word);
      utterance.lang = 'en-US';
      utterance.rate = .85;
      ownSpeech = true;
      utterance.onend = () => { if (epoch === audioEpoch) ownSpeech = false; };
      utterance.onerror = () => {
        if (epoch !== audioEpoch) return;
        ownSpeech = false;
        message('朗读失败，请检查系统英语语音是否可用');
      };
      speechSynthesis.speak(utterance);
    };
    if (!audioUrl(entry.audio)) { fallback(); return; }
    activeAudio = new Audio(entry.audio);
    activeAudio.play().catch(() => {
      if (epoch !== audioEpoch) return;
      message('在线音频不可用，尝试浏览器朗读'); fallback();
    });
  }
  const translations = new Map();
  const sentenceProviderLabels = { google: 'Google Translate', microsoft: 'Microsoft Translator', mymemory: 'MyMemory' };
  async function machineTranslation(source, provider, check, transient = false) {
    const translated = [];
    for (const chunk of translationChunks(source)) {
      check();
      let value;
      if (provider === 'google') {
        if (!transient && cleanSettings(get('settings', {})).translationFallback !== 'google') throw new Error('备用翻译已关闭');
        const result = await request('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=' + encodeURIComponent(chunk), transient, transient);
        const segments = result?.[0];
        if (!Array.isArray(segments) || !segments.length ||
          !segments.every(segment => Array.isArray(segment) && typeof segment[0] === 'string')) {
          throw new Error('翻译服务返回格式异常，请稍后重试');
        }
        value = segments.map(segment => segment[0]).join('');
      } else if (provider === 'microsoft') {
        const result = await request('https://edge.microsoft.com/translate/translatetext?from=en&to=zh-Hans&isEnterpriseClient=false',
          transient, transient, JSON.stringify([chunk]));
        const candidates = result?.[0]?.translations;
        if (!Array.isArray(result) || result.length !== 1 || !Array.isArray(candidates) || candidates.length !== 1 ||
          typeof candidates[0]?.to !== 'string' || candidates[0].to.toLowerCase() !== 'zh-hans') {
          throw new Error('翻译服务返回格式异常，请稍后重试');
        }
        value = candidates[0].text;
      } else if (provider === 'mymemory') {
        const result = await request('https://api.mymemory.translated.net/get?langpair=en%7Czh-CN&q=' + encodeURIComponent(chunk), transient, transient);
        value = result?.responseData?.translatedText;
        if (Number(result?.responseStatus) !== 200 || result?.quotaFinished) {
          throw new Error('中文服务暂不可用或额度已用尽，可稍后重试');
        }
      } else throw new Error('未知翻译服务');
      if (typeof value !== 'string' || !value.trim()) throw new Error('中文服务未返回有效翻译，请稍后重试');
      translated.push(value.trim());
    }
    const translation = translated.join('\n');
    if (translation.length > 16000) throw new Error('中文响应过长，请稍后重试');
    return translation;
  }
  async function sentenceTranslation(source, check) {
    const failures = [];
    for (const [index, provider] of ['google', 'microsoft', 'mymemory'].entries()) {
      check();
      if (index && cleanSettings(get('settings', {})).translationFallback !== 'google') break;
      const checkProvider = () => {
        check();
        if (index && cleanSettings(get('settings', {})).translationFallback !== 'google') throw new Error('备用翻译已关闭');
      };
      try {
        return { translation: await machineTranslation(source, provider, checkProvider, true), translationProvider: provider, failures };
      } catch (error) {
        check();
        failures.push({ provider, error });
      }
    }
    throw new Error(failures.map(({ provider, error }) => `${sentenceProviderLabels[provider]}：${error.message}`).join('；'));
  }
  async function machineTranslationWithFallback(source, check) {
    try {
      return { translation: await machineTranslation(source, 'mymemory', check), translationProvider: 'mymemory' };
    } catch (error) {
      check();
      if (cleanSettings(get('settings', {})).translationFallback !== 'google') throw error;
      try {
        return { translation: await machineTranslation(source, 'google', check),
          translationProvider: 'google', primaryError: error };
      } catch (fallbackError) {
        throw new Error(`${error.message}；Google Translate：${fallbackError.message}`);
      }
    }
  }
  function translate(entry, provider) {
    const source = translationSource(entry);
    const key = provider + '\n' + entry.word + (provider === 'mymemory' ? '\n' + source : '');
    if (!translations.has(key)) {
      const pending = (async () => {
        const epoch = activityEpoch;
        if (!get('word:' + entry.word)) throw new Error('词条已删除，请重新查询');
        let translation;
        let translationProvider = 'mymemory';
        let primaryError;
        if (provider === 'youdao') {
          translation = youdaoTranslation(await requestYoudao(entry.word), entry.word);
        } else {
          const check = () => {
            checkActivity(epoch);
            const current = get('word:' + entry.word);
            if (!current) throw new Error('词条已删除，请重新查询');
            if (translationSource(current) !== source) throw new Error('词典释义已更新，请重新获取中文');
          };
          ({ translation, translationProvider, primaryError } = await machineTranslationWithFallback(source, check));
        }
        checkActivity(epoch);
        const current = get('word:' + entry.word);
        if (!current) throw new Error('词条已删除，请重新查询');
        if (provider === 'mymemory' && translationSource(current) !== source) throw new Error('词典释义已更新，请重新获取中文');
        const updated = { ...current, ...(provider === 'youdao'
          ? { youdaoTranslation: translation, youdaoTranslatedAt: Date.now() }
          : { translation, translationSource: source, translationProvider, translatedAt: Date.now() }) };
        put('word:' + entry.word, updated);
        notify();
        return { updated, primaryError };
      })();
      translations.set(key, pending);
      pending.finally(() => translations.delete(key)).catch(() => { });
    }
    return translations.get(key);
  }
  function translationBlock(entry, provider, autoLoad) {
    const node = el('section', 'translation translation-' + provider);
    const label = provider === 'youdao' ? '有道词典' : 'MyMemory';
    const show = (current, primaryError, retry = true) => {
      const fallback = provider === 'mymemory' && current.translationProvider === 'google';
      node.replaceChildren(el('div', 'pos', fallback ? 'Google Translate（备用）' : label));
      const value = provider === 'youdao' ? current.youdaoTranslation : current.translation;
      if (value) node.append(el('div', 'translation-copy', value));
      node.append(el('div', 'meta', provider === 'youdao' ? '中文词典释义 · 不与英文逐条对应' : '英文释义的机器翻译'));
      if (provider === 'youdao') node.append(link('有道词典', 'https://www.youdao.com/result?word=' + encodeURIComponent(entry.word) + '&lang=en'));
      if (fallback) {
        node.append(el('p', 'notice', primaryError
          ? `MyMemory：${primaryError.message}；已使用 Google Translate 备用翻译`
          : 'MyMemory 不可用时获取的备用翻译 · 已缓存'));
        if (retry) node.append(button('重试 MyMemory 中文释义', load));
      }
    };
    async function load() {
      show(get('word:' + entry.word) || entry, null, false);
      node.append(el('p', 'muted', '正在获取 ' + label + ' 中文释义…'));
      try {
        const { updated, primaryError } = await translate(entry, provider);
        show(updated, primaryError);
      }
      catch (error) {
        show(get('word:' + entry.word) || entry, null, false);
        node.append(el('p', 'notice', label + '：' + error.message), button('重试 ' + label + ' 中文释义', load));
      }
    }
    if (provider === 'youdao' ? entry.youdaoTranslation : entry.translation && entry.translationSource === translationSource(entry)) show(entry);
    else if (autoLoad) load();
    else {
      show(entry, null, false);
      node.append(button(provider === 'youdao' ? '获取有道中文释义' : '获取 MyMemory 中文释义', load));
    }
    return node;
  }
  function chineseDefinitions(entry, autoLoad = true) {
    const node = el('div', 'chinese-definitions');
    node.append(translationBlock(entry, 'mymemory', autoLoad), translationBlock(entry, 'youdao', autoLoad));
    return node;
  }
  function toggleStar(word, rerender = true) {
    const existing = get('study:' + word);
    if (existing) {
      if (!confirm(`将 ${word} 移出生词本？该词的复习进度也会删除，查词历史保留。`)) return false;
      remove('study:' + word);
      if (get('recall:' + word)) remove('recall:' + word);
    } else {
      put('study:' + word, createStudy(word));
    }
    notify();
    refreshStarButtons();
    if (internalLookup) refreshLibrary?.();
    if (rerender && !overlay.hidden) render();
    return true;
  }
  function refreshStarButtons() {
    for (const node of shadow.querySelectorAll('[data-star-word]')) {
      const word = node.getAttribute('data-star-word');
      const starred = Boolean(get('study:' + word));
      node.textContent = starred ? '★' : '☆';
      node.setAttribute('aria-pressed', String(starred));
      node.classList.toggle('starred', starred);
      node.title = starred ? `取消收藏 ${word}` : `收藏 ${word}`;
      node.setAttribute('aria-label', node.title);
    }
  }
  function senses(entry, autoLoad = true) {
    const container = el('div');
    for (const meaning of entry.meanings) {
      const section = el('section', 'sense');
      section.append(el('div', 'pos', meaning.partOfSpeech || '释义'));
      meaning.definitions.forEach((def, index) => {
        section.append(el('p', 'definition', `${meaning.definitions.length > 1 ? index + 1 + '. ' : ''}${def.definition}`));
        if (def.example) section.append(el('p', 'example', '例句：' + def.example));
      });
      container.append(section);
    }
    container.append(wordFormsBlock(entry, autoLoad));
    return container;
  }
  const exampleRequests = new Map();
  function examplesBlock(entry, autoLoad) {
    const node = el('section', 'usage-examples sense');
    const show = current => {
      node.replaceChildren(el('div', 'pos', '用法例句'));
      node.append(el('p', 'meta', '有道双语例句 · 展示用法与语境，不与上方释义逐条对应'));
      for (const example of current.examples || []) {
        const row = el('div', 'example');
        const sentence = el('p', 'example-en');
        sentence.setAttribute('lang', 'en');
        let end = 0;
        for (const match of example.sentence.matchAll(wordPattern(entry.word, 'gi'))) {
          const start = match.index + match[1].length;
          sentence.append(document.createTextNode(example.sentence.slice(end, start)), el('strong', 'example-word', match[2]));
          end = start + match[2].length;
        }
        sentence.append(document.createTextNode(example.sentence.slice(end)));
        row.append(sentence);
        if (example.translation) row.append(el('p', 'example-zh', example.translation));
        if (example.source) row.append(el('div', 'meta', example.source));
        node.append(row);
      }
      node.append(link('有道例句 ↗', 'https://www.youdao.com/result?word=' + encodeURIComponent(entry.word) + '&lang=en'));
      if (current.examples?.length) node.append(button('更新用法例句', () => load(true),
        'button', '从有道完整例句结果获取更多用法例句（最多 12 条）'));
    };
    async function load(more = false) {
      show(get('word:' + entry.word) || entry);
      node.querySelector('button')?.remove();
      node.append(el('p', 'muted', '正在获取用法例句…'));
      try {
        const key = more ? 'lj:' + entry.word : entry.word;
        if (!exampleRequests.has(key)) {
          const pending = (async () => {
            const epoch = activityEpoch;
            const examples = youdaoExamples(await requestYoudao(entry.word, more), entry.word);
            checkActivity(epoch);
            const current = get('word:' + entry.word);
            if (!current) throw new Error('词条已删除，请重新查询');
            const updated = { ...current, examples, examplesFetchedAt: Date.now() };
            put('word:' + entry.word, updated);
            notify();
            return updated;
          })();
          exampleRequests.set(key, pending);
          pending.finally(() => exampleRequests.delete(key)).catch(() => { });
        }
        const updated = await exampleRequests.get(key);
        show(updated);
        if (!updated.examples.length) unavailable();
      } catch (error) {
        show(get('word:' + entry.word) || entry);
        node.querySelector('button')?.remove();
        node.append(el('p', 'notice', '有道例句：' + error.message), button('重试用法例句', () => load(more)));
      }
    }
    function unavailable() {
      node.append(el('p', 'muted', '暂未找到该词的双语例句'), button('重试用法例句', () => load(true)));
    }
    if (entry.examples) {
      show(entry);
      if (!entry.examples.length) unavailable();
    } else if (autoLoad) load();
    else {
      show(entry);
      node.append(button('获取用法例句', load));
    }
    return node;
  }
  const youdaoRequests = new Map();
  function requestYoudao(word, fullExamples = false) {
    const query = fullExamples ? 'lj:' + word : word;
    if (!youdaoRequests.has(query)) {
      const pending = request('https://dict.youdao.com/jsonapi?q=' + encodeURIComponent(query)
        + '&dicts=' + encodeURIComponent(JSON.stringify(fullExamples
          ? { count: MAX_EXAMPLES, dicts: [['blng_sents']] }
          : { count: 3, dicts: [['ec', 'blng_sents_part']] })));
      youdaoRequests.set(query, pending);
      pending.finally(() => youdaoRequests.delete(query)).catch(() => { });
    }
    return youdaoRequests.get(query);
  }
  const inflections = new Map();
  function wordFormsBlock(entry, autoLoad) {
    const node = el('section', 'word-forms sense');
    const show = wordForms => {
      node.replaceChildren();
      node.hidden = wordForms.base === entry.word && !wordForms.forms.length;
      if (node.hidden) return;
      node.append(el('div', 'pos', '词形变化'));
      const list = el('dl');
      list.append(el('dt', '', '原形'), el('dd', '', wordForms.base));
      for (const { name, value } of wordForms.forms) {
        list.append(el('dt', '', name), el('dd', '', value + (value === entry.word ? '（当前词）' : '')));
      }
      node.append(list, link('有道词形', 'https://www.youdao.com/result?word=' + encodeURIComponent(wordForms.base) + '&lang=en'));
    };
    async function load() {
      node.replaceChildren(el('div', 'pos', '词形变化'), el('p', 'muted', '正在获取词形变化…'));
      try {
        if (!inflections.has(entry.word)) {
          const pending = (async () => {
            const epoch = activityEpoch;
            let wordForms = youdaoWordForms(await requestYoudao(entry.word), entry.word);
            checkActivity(epoch);
            if (wordForms.base !== entry.word) {
              const rootForms = youdaoWordForms(await requestYoudao(wordForms.base), wordForms.base);
              if (rootForms.base !== wordForms.base) throw new Error('词形原形不一致，请稍后重试');
              wordForms = rootForms;
            }
            checkActivity(epoch);
            const current = get('word:' + entry.word);
            if (!current) throw new Error('词条已删除，请重新查询');
            const updated = { ...current, wordForms };
            put('word:' + entry.word, updated);
            notify();
            return updated;
          })();
          inflections.set(entry.word, pending);
          pending.finally(() => inflections.delete(entry.word)).catch(() => { });
        }
        show((await inflections.get(entry.word)).wordForms);
      } catch (error) {
        node.replaceChildren(el('div', 'pos', '词形变化'), el('p', 'notice', error.message),
          button('重试词形变化', load));
      }
    }
    if (entry.wordForms) show(entry.wordForms);
    else if (autoLoad) load();
    else node.append(button('补全词形变化', load));
    return node;
  }
  const pronunciations = new Map();
  function phoneticBlock(entry, autoLoad = true) {
    const node = el('div', 'phonetic');
    const show = current => {
      node.title = current.phoneticSource === 'datamuse' ? 'Datamuse 美式参考音标；罕见词可能由服务按拼写推测，并非人工校验。' : '';
      node.replaceChildren(el('span', '', current.phonetic), button('▷', () => speak(entry), 'icon', '播放单词发音'));
      if (current.phoneticSource === 'youdao') node.append(link('有道音标', 'https://www.youdao.com/result?word=' + encodeURIComponent(entry.word) + '&lang=en'));
      if (current.phoneticSource === 'datamuse') node.append(link('Datamuse 音标（参考）', 'https://www.datamuse.com/api/'));
    };
    async function load() {
      show(entry.phonetic.trim() ? entry : { ...entry, phonetic: '正在获取有道音标…' });
      try {
        if (!pronunciations.has(entry.word)) {
          const pending = (async () => {
            const epoch = activityEpoch;
            let phonetic;
            let phoneticSource = 'youdao';
            let primaryError;
            try {
              phonetic = youdaoPhonetic(await requestYoudao(entry.word), entry.word);
            } catch (error) {
              checkActivity(epoch);
              primaryError = error;
              checkActivity(epoch);
              const current = get('word:' + entry.word);
              if (!current) throw new Error('词条已删除，请重新查询');
              if (current.phonetic.trim() || cleanSettings(get('settings', {})).phoneticFallback !== 'datamuse') throw error;
              show({ ...entry, phonetic: '正在获取备用音标…' });
              node.title = '有道：' + error.message;
              try {
                phonetic = datamusePhonetic(await request('https://api.datamuse.com/words?sp='
                  + encodeURIComponent(entry.word) + '&md=r&ipa=1&max=1'), entry.word);
                phoneticSource = 'datamuse';
              } catch (fallbackError) {
                throw new Error(`有道：${error.message}；Datamuse：${fallbackError.message}`);
              }
            }
            const current = get('word:' + entry.word);
            if (!current) throw new Error('词条已删除，请重新查询');
            if (current.phonetic.trim() && (current.phoneticSource === 'youdao' || phoneticSource === 'datamuse')) return { updated: current, primaryError };
            const updated = { ...current, phonetic, phoneticSource };
            put('word:' + entry.word, updated);
            notify();
            return { updated, primaryError };
          })();
          pronunciations.set(entry.word, pending);
          pending.finally(() => pronunciations.delete(entry.word)).catch(() => { });
        }
        const { updated, primaryError } = await pronunciations.get(entry.word);
        show(updated);
        if (primaryError && updated.phoneticSource === 'datamuse') node.title = `有道：${primaryError.message}；已使用备用音标。` + node.title;
      } catch (error) {
        const current = get('word:' + entry.word) || entry;
        show(current.phonetic.trim() ? current : { ...current, phonetic: '音标暂不可用' });
        if (current.phonetic.trim()) node.append(el('span', '', '有道音标暂不可用'));
        node.append(button('重试', load));
        node.title = error.message;
      }
    }
    if (entry.phonetic.trim() && ['youdao', 'datamuse'].includes(entry.phoneticSource)) show(entry);
    else if (autoLoad) load();
    else {
      show(entry);
      node.append(button('补全音标', load));
    }
    return node;
  }
  function historyRecords(word) {
    return ordered(all('event').filter(item => item.word === word));
  }
  function historyFootprint(word, onDelete, label) {
    const records = historyRecords(word);
    if (!records.length) return null;
    const footprint = el('details', 'history-footprint');
    footprint.append(el('summary', '', label || `查询足迹 · ${records.length} 次`));
    for (const record of records) {
      const row = el('div', 'history-entry');
      const content = el('div', 'history-entry-content');
      content.append(el('div', 'meta', date(record.at)));
      if (record.context) content.append(el('p', 'history-context', record.context));
      if (safeUrl(record.sourceUrl)) content.append(link(record.title || '打开原网页', record.sourceUrl));
      else if (record.title) content.append(el('div', 'meta', record.title));
      row.append(content);
      if (onDelete) row.append(button('×', () => onDelete(record), 'icon danger history-delete',
        `删除 ${word} 在 ${date(record.at)} 的这条查询记录`));
      footprint.append(row);
    }
    return footprint;
  }
  function wordDetail(entry, event = null, allowStar = true, node = el('article', 'detail'), onHistoryDelete = null, onWordDelete = null) {
    node.replaceChildren();
    const title = el('div', 'bar word-heading');
    const actions = el('div', 'actions');
    if (allowStar) {
      const starred = Boolean(get('study:' + entry.word));
      const star = button(starred ? '★' : '☆', () => toggleStar(entry.word, !internalLookup),
        starred ? 'icon detail-star starred' : 'icon detail-star', starred ? `取消收藏 ${entry.word}` : `收藏 ${entry.word}`);
      star.setAttribute('aria-pressed', String(starred));
      star.setAttribute('data-star-word', entry.word);
      actions.append(star);
    }
    const refreshNotice = el('p', 'notice');
    refreshNotice.hidden = true;
    const refresh = button('更新释义', async () => {
      refresh.disabled = true;
      refreshNotice.hidden = true;
      refresh.textContent = '正在更新…';
      try {
        const epoch = activityEpoch;
        const response = await request('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(entry.word));
        checkActivity(epoch);
        if (!get('word:' + entry.word)) throw new Error('词条已删除，请重新查询');
        const updated = preserveWordEnrichment(dictionary(response, entry.word, Date.now()));
        put('word:' + entry.word, updated);
        notify();
        wordDetail(updated, event, allowStar, node, onHistoryDelete, onWordDelete);
      } catch (error) {
        refreshNotice.textContent = '更新释义失败：' + error.message;
        refreshNotice.hidden = false;
      } finally {
        refresh.disabled = false;
        refresh.textContent = '更新释义';
      }
    }, 'button', '重新获取英文释义及各含义的例句，保留收藏和复习进度');
    actions.append(refresh);
    if (onWordDelete) actions.append(button('删除', onWordDelete, 'button danger',
      `删除 ${entry.word}${onHistoryDelete ? ' 的全部查词记录' : ' 的生词本记录'}`));
    title.append(el('h2', 'word', entry.word), actions);
    node.append(title, refreshNotice, phoneticBlock(entry));
    if (onHistoryDelete) {
      const footprint = historyFootprint(entry.word, onHistoryDelete);
      if (footprint) node.append(footprint);
    } else if (allowStar) {
      const records = historyRecords(entry.word);
      if (records.length > 1) {
        const label = `查过 ${records.length} 次 · 最近 ${date(records[0].at)}`;
        const footprint = historyFootprint(entry.word, null, label);
        if (footprint) node.append(footprint);
      }
    }
    node.append(senses(entry));
    node.append(chineseDefinitions(entry));
    if (event?.context || event?.sourceUrl) {
      const context = el('details', 'context');
      context.append(el('summary', '', '阅读来源'));
      if (event.context) context.append(el('p', '', event.context));
      if (safeUrl(event.sourceUrl)) context.append(link(event.title || '打开原网页', event.sourceUrl));
      node.append(context);
    }
    const source = el('footer', 'source');
    source.append(link('Free Dictionary API', 'https://dictionaryapi.dev/'));
    if (entry.sourceUrl) source.append(link('词条出处', entry.sourceUrl));
    if (entry.license.name) source.append(link(entry.license.name, entry.license.url || entry.sourceUrl));
    node.append(source);
    node.append(examplesBlock(entry));
    return node;
  }

  function render() {
    resetInternalLookup();
    cancelInternalSelection();
    librarySheet?.dispose();
    librarySheet = null;
    refreshLibrary = null;
    clearTimeout(reviewTimer);
    for (const [key, node] of Object.entries(navButtons)) {
      node.classList.toggle('active', key === screen);
      if (key === screen) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current');
    }
    view.classList.toggle('library', screen === 'history' || screen === 'book');
    view.classList.toggle('scope-view', screen === 'sites');
    view.replaceChildren();
    if (screen === 'settings') { renderSettings(); return; }
    if (screen === 'sites') { renderSites(); return; }
    if (screen === 'review') { renderReview(); return; }
    renderLibrary();
  }
  const PAGE_SIZE = 50;
  function createPager(className, move) {
    const node = el('div', 'scope-pagination' + (className ? ' ' + className : ''));
    const label = el('span', 'meta');
    label.setAttribute('role', 'status');
    const previous = button('上一页', () => move(-1));
    const next = button('下一页', () => move(1));
    node.append(label, previous, next);
    return {
      node,
      update(total, page) {
        const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        page = Math.max(0, Math.min(page, pages - 1));
        label.textContent = `${page + 1} / ${pages} 页`;
        previous.disabled = page === 0;
        next.disabled = page === pages - 1;
        return page;
      }
    };
  }
  function renderLibrary() {
    const isBook = screen === 'book';
    const state = libraryState[isBook ? 'book' : 'history'];
    const subheading = el('p', 'subheading');
    view.append(el('h1', 'heading', isBook ? '生词本' : '查词历史'), subheading);
    const split = el('div', 'split');
    const left = el('div', 'library-list');
    const toolbar = el('div', 'row');
    const search = el('input');
    search.placeholder = '筛选单词…';
    search.setAttribute('aria-label', '筛选已保存单词');
    search.value = state.filter;
    toolbar.append(search);
    if (!isBook) {
      const order = el('select');
      order.setAttribute('aria-label', '历史排序');
      for (const [value, label] of [['new', '最近'], ['old', '最早'], ['count', '最多']]) {
        const option = el('option', '', label);
        option.value = value;
        order.append(option);
      }
      order.value = historyOrder;
      order.addEventListener('change', () => { historyOrder = order.value; firstPage(); });
      toolbar.append(order);
    }
    const list = el('div', 'list');
    list.tabIndex = 0;
    list.setAttribute('role', 'region');
    list.setAttribute('aria-label', isBook ? '生词列表' : '查询历史列表');
    const detail = el('div', 'detail detail-pane');
    detail.tabIndex = 0;
    detail.setAttribute('role', 'region');
    detail.setAttribute('aria-label', '单词释义');
    const layer = el('div', 'library-detail');
    const panel = el('section', 'library-sheet');
    panel.tabIndex = -1;
    const sheetBar = el('header', 'library-sheet-bar');
    sheetBar.append(el('strong', '', '单词释义'), button('关闭', () => closeSheet(), 'button', '关闭释义，返回列表'));
    const sheetNav = el('nav', 'library-sheet-nav');
    sheetNav.setAttribute('aria-label', '切换单词');
    const previousWord = button('‹ 上一个', () => moveWord(-1));
    const nextWord = button('下一个 ›', () => moveWord(1));
    const positionLabel = el('span', 'meta');
    positionLabel.setAttribute('role', 'status');
    positionLabel.setAttribute('aria-live', 'polite');
    positionLabel.setAttribute('aria-atomic', 'true');
    sheetNav.append(previousWord, positionLabel, nextWord);
    panel.append(sheetBar, detail, sheetNav);
    layer.append(panel);
    let matches = [];
    let sheetOpen = false;
    let sheetOrigin = null;
    let sheetMoved = false;
    let lastCompact = null;
    const pager = createPager('library-pagination', direction => {
      state.page += direction;
      drawList();
      list.scrollTop = 0;
    });
    left.append(toolbar, list, pager.node);
    split.append(left, layer);
    view.append(split);
    function selectedIndex() {
      return matches.findIndex(item => item.word === selectedWord);
    }
    function updateWordNavigation() {
      const index = selectedIndex();
      previousWord.disabled = index <= 0;
      nextWord.disabled = index < 0 || index >= matches.length - 1;
      positionLabel.textContent = `${index + 1} / ${matches.length}`;
    }
    function showSheet() {
      if (!compact || sheetOpen) return;
      sheetOrigin = { page: state.page, listTop: list.scrollTop, viewTop: view.scrollTop };
      sheetMoved = false;
      sheetOpen = true;
      layer.hidden = false;
      sidebar.inert = main.inert = true;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-label', '单词释义面板');
      panel.focus({ preventScroll: true });
    }
    function closeSheet(restoreFocus = true) {
      if (!sheetOpen) return;
      resetInternalLookup(); cancelInternalSelection(); stopQuery(); stopAudio();
      sheetOpen = false;
      layer.hidden = compact;
      sidebar.inert = main.inert = false;
      panel.removeAttribute('role');
      panel.removeAttribute('aria-modal');
      panel.removeAttribute('aria-label');
      if (!restoreFocus) return;
      const index = selectedIndex();
      state.page = sheetMoved && index >= 0 ? Math.floor(index / PAGE_SIZE) : sheetOrigin.page;
      drawList();
      list.scrollTop = sheetOrigin.listTop;
      view.scrollTop = sheetOrigin.viewTop;
      const active = [...list.querySelectorAll('.item')].find(row => row.getAttribute('aria-current') === 'true');
      if (sheetMoved && active) {
        const bounds = list.getBoundingClientRect();
        const row = active.getBoundingClientRect();
        const unit = bounds.height / list.clientHeight || 1;
        if (row.top < bounds.top) list.scrollTop += (row.top - bounds.top) / unit;
        else if (row.bottom > bounds.bottom) list.scrollTop += (row.bottom - bounds.bottom) / unit;
      }
      (active || search).focus({ preventScroll: true });
    }
    function layoutSheet() {
      if (lastCompact === compact) return;
      const focusedDetail = layer.contains(shadow.activeElement);
      closeSheet(false);
      layer.hidden = compact;
      (compact ? studio : split).append(layer);
      lastCompact = compact;
      drawList();
      if (focusedDetail) (compact ? studio : detail).focus({ preventScroll: true });
    }
    layer.addEventListener('click', event => { if (event.target === layer) closeSheet(); });
    librarySheet = {
      get open() { return sheetOpen; }, panel, show: showSheet, close: closeSheet, layout: layoutSheet,
      dispose() { closeSheet(false); layer.remove(); }
    };
    function selectItem(item) {
      resetInternalLookup(); cancelInternalSelection(); stopAudio();
      selectedWord = item.word;
      const scrollTop = list.scrollTop;
      drawList(); drawDetail();
      list.scrollTop = scrollTop;
      detail.scrollTop = 0;
    }
    function moveWord(direction) {
      const item = matches[selectedIndex() + direction];
      if (!item) { message('当前记录已变化，请重新选择单词'); return; }
      const index = matches.indexOf(item);
      state.page = Math.floor(index / PAGE_SIZE);
      sheetMoved = true;
      selectItem(item);
      if (shadow.activeElement?.disabled) panel.focus({ preventScroll: true });
    }
    function drawDetail() {
      const entry = selectedWord && (!isBook || get('study:' + selectedWord)) ? get('word:' + selectedWord) : null;
      detail.replaceChildren(entry
        ? wordDetail(entry, null, false, undefined, isBook ? null : deleteHistoryRecord, () => deleteWord(entry.word))
        : el('div', 'empty', '选择一个单词，或在上方开始查询'));
    }
    function deleteHistoryRecord(record) {
      if (!confirm(`删除 ${record.word} 在 ${date(record.at)} 的这条查询记录？`)) return;
      remove('event:' + record.id);
      notify();
      redrawDeletedWord(record.word);
    }
    function deleteWord(word) {
      if (isBook) {
        if (!get('study:' + word)) {
          redrawDeletedWord(word);
          throw new Error('该词已不在生词本，请重新选择');
        }
        if (!toggleStar(word, false)) return;
      } else {
        if (!confirm(`删除 ${word} 的全部查词记录？生词本、复习进度和词条缓存保留。`)) return;
        const records = historyRecords(word);
        let removed = 0;
        try {
          for (const record of records) {
            remove('event:' + record.id);
            removed++;
          }
        } finally {
          if (removed) {
            notify();
            redrawDeletedWord(word);
          }
        }
        return;
      }
      redrawDeletedWord(word);
    }
    function redrawDeletedWord(word) {
      const listTop = list.scrollTop;
      const detailTop = detail.scrollTop;
      const currentIndex = matches.findIndex(item => item.word === word);
      const neighbor = matches[currentIndex + 1] || matches[currentIndex - 1];
      if (selectedWord === word && (isBook ? !get('study:' + word) : !historyRecords(word).length)) {
        selectedWord = neighbor?.word || '';
        if (sheetOpen) sheetMoved = true;
      }
      drawList();
      drawDetail();
      list.scrollTop = listTop;
      if (selectedWord === word) detail.scrollTop = detailTop;
      else detail.scrollTop = 0;
      if (sheetOpen) panel.focus({ preventScroll: true });
      else {
        const active = [...list.querySelectorAll('.item')].find(row => row.getAttribute('aria-current') === 'true');
        (active || search).focus({ preventScroll: true });
      }
    }
    function drawList() {
      const history = isBook ? [] : all('event');
      const records = isBook
        ? all('study').sort((a, b) => b.addedAt - a.addedAt || a.word.localeCompare(b.word))
        : groupHistory(history, historyOrder);
      subheading.textContent = isBook ? `${records.length} 个词 · 收藏的词会进入复习`
        : `${records.length} 个词 · ${history.length} 次查询`;
      list.replaceChildren();
      const filter = state.filter.trim().toLowerCase();
      matches = records.filter(item => item.word.includes(filter));
      updateWordNavigation();
      state.page = pager.update(matches.length, state.page);
      pager.node.hidden = matches.length <= PAGE_SIZE;
      if (!matches.length) { list.append(el('div', 'empty', records.length ? '没有匹配的单词' : isBook ? '遇到想记住的词，点一下收藏' : '你的第一条查词记录会出现在这里')); return; }
      const start = state.page * PAGE_SIZE;
      for (const [index, item] of matches.slice(start, start + PAGE_SIZE).entries()) {
        const position = start + index;
        const neighbor = matches[position + 1] || matches[position - 1];
        const row = button('', () => {
          selectItem(item);
          showSheet();
        }, 'item');
        const active = selectedWord === item.word;
        row.classList.toggle('active', active);
        if (active) row.setAttribute('aria-current', 'true');
        if (compact) row.setAttribute('aria-haspopup', 'dialog');
        row.append(el('div', 'term', item.word), el('div', 'meta', isBook
          ? bookMeta(item) : `${item.events.length} 次查询 · 最近 ${date(item.latestAt)}`));
        const starred = Boolean(get('study:' + item.word));
        const wrapper = el('div', isBook ? 'library-row' : 'library-row history-row');
        const actions = el('div', 'row-actions');
        const star = button(starred ? '★' : '☆', () => {
          const scrollTop = list.scrollTop;
          const detailTop = detail.scrollTop;
          if (!toggleStar(item.word, false)) { star.focus({ preventScroll: true }); return; }
          if (isBook) {
            const deletingSelected = selectedWord === item.word;
            if (deletingSelected) selectedWord = neighbor?.word || '';
            redrawAfterRemoval('.list-star', position, start, scrollTop, deletingSelected, detailTop);
          } else {
            drawList();
            list.scrollTop = scrollTop;
            list.querySelectorAll('.list-star')[index]?.focus({ preventScroll: true });
          }
        }, starred ? 'icon list-star starred' : 'icon list-star', starred ? `取消收藏 ${item.word}` : `收藏 ${item.word}`);
        star.setAttribute('aria-pressed', String(starred));
        star.setAttribute('data-star-word', item.word);
        actions.append(star);
        wrapper.append(row, actions);
        list.append(wrapper);
      }
    }
    function redrawAfterRemoval(selector, position, previousStart, scrollTop, deletingSelected, detailTop) {
      render();
      const activeList = view.querySelector('.list');
      const start = state.page * PAGE_SIZE;
      if (start === previousStart) activeList.scrollTop = scrollTop;
      if (!deletingSelected) view.querySelector('.detail-pane').scrollTop = detailTop;
      const buttons = activeList.querySelectorAll(selector);
      (buttons[Math.min(position - start, buttons.length - 1)] || view.querySelector('input')).focus({ preventScroll: start === previousStart });
    }
    function firstPage() {
      state.page = 0;
      drawList();
      list.scrollTop = 0;
    }
    search.addEventListener('input', () => { state.filter = search.value; firstPage(); });
    refreshLibrary = () => {
      const scrollTop = list.scrollTop;
      drawList();
      list.scrollTop = scrollTop;
    };
    layoutSheet(); drawDetail();
  }
  function bookMeta(item) {
    const label = stateOf(item) === memory.State.New ? '新词 · 待学习'
      : availableAt(item) <= Date.now() ? '待复习' : '下次 ' + when(item);
    return isLeech(item) ? label + ' · 难记词' : label;
  }
  function savedContexts() {
    const contexts = new Map();
    for (const event of ordered(all('event'))) {
      if (!event.context || contexts.has(event.word)) continue;
      const parts = contextParts(event.context, event.word);
      if (parts) contexts.set(event.word, parts);
    }
    return contexts;
  }
  function startRound() {
    review.start();
    reviewContexts = savedContexts();
    render();
  }
  function showAnswer(entry) {
    if (review.reveal(entry)) render();
  }
  function gradeCard(entry, grade) {
    const result = review.grade(entry, grade);
    if (!result) return;
    if (result !== 'expired') stopAudio();
    render();
    if (result === 'saved') notify();
    else if (result === 'stale') message('该词已在其他页面更新，已跳过');
    else if (result === 'paused') message('反向卡已暂停，已跳过');
    else if (result === 'limited') message('今日新词上限已用完，已跳过这张新卡');
    else if (result === 'expired') message('显示答案已超过 10 分钟，请重新选择评分');
  }
  function undo() {
    const result = review.undo();
    if (!result) return;
    if (result.stale) {
      render(); message('该词已在其他页面更新，无法撤销'); return;
    }
    stopAudio(); render();
    notify();
    message(`已撤销 ${result.word} 的评分`);
  }
  function reviewKey(event) {
    const tag = event.composedPath()[0]?.tagName || '';
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag);
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
      if (typing || !review.undoWord) return false;
      undo(); return true;
    }
    const entry = review.presented;
    if (event.ctrlKey || event.metaKey || typing || !entry) return false;
    if (/^[1-4]$/.test(event.key)) { gradeCard(entry, Object.keys(GRADES)[event.key - 1]); return true; }
    if (!review.revealed && (event.key === ' ' || event.key === 'Enter') && !/^(BUTTON|A)$/.test(tag)) { showAnswer(entry); return true; }
    if (event.key.toLowerCase() === 'r' && (entry.kind === 'meaning' || review.revealed)) { speak(get('word:' + entry.word)); return true; }
    return false;
  }
  const CLOZE = '＿＿＿';
  const maskWord = (value, word) => value.replace(wordPattern(word, 'gi'), '$1' + CLOZE);
  function contextLine(parts, hiddenWord) {
    const node = el('p', 'context-line');
    node.title = '阅读时保存的原句';
    if (hiddenWord) {
      const sentence = parts.before + parts.match + parts.after;
      let end = 0;
      for (const match of sentence.matchAll(wordPattern(hiddenWord, 'gi'))) {
        const start = match.index + match[1].length;
        node.append(document.createTextNode(sentence.slice(end, start)), el('span', 'cloze', CLOZE));
        end = start + match[2].length;
      }
      node.append(document.createTextNode(sentence.slice(end)));
    } else {
      node.append(document.createTextNode(parts.before), el('mark', '', parts.match), document.createTextNode(parts.after));
    }
    return node;
  }
  function refreshLater(now, plan) {
    const delay = Math.min(60000, plan.end - now, ...(plan.upcoming.length ? [plan.upcoming[0].at - now] : []));
    reviewTimer = setTimeout(() => {
      if (!overlay.hidden && screen === 'review') render();
    }, Math.max(1, delay));
  }
  function renderReview() {
    const now = Date.now();
    view.append(el('h1', 'heading', '让单词留下来'), el('p', 'subheading', '短时复习，长期积累'));
    const entry = review.current();
    if (entry) renderCard(entry);
    else if (review.waitingUntil) renderReviewWait(now, review.waitingUntil);
    else if (review.active) renderRoundDone(now);
    else renderOverview(now);
  }
  function renderOverview(now) {
    const plan = review.plan(now);
    const { book, recalls } = plan;
    refreshLater(now, plan);
    const reviewedToday = new Set([...book, ...recalls].filter(item => item.lastReviewedAt >= plan.start).map(item => item.word)).size;
    const stats = el('div', 'stats');
    for (const [value, label] of [[plan.learning.length + plan.reviews.length, '到期复习'], [plan.newToday, '今日新词'],
      [reviewedToday, '今日已复习词数'], [book.length, '收藏词数']]) {
      const stat = el('div', 'stat'); stat.append(el('strong', '', String(value)), el('span', 'muted', label)); stats.append(stat);
    }
    const landing = el('div', 'review');
    const limited = plan.fresh.length > 0 && plan.newLeft === 0;
    if (plan.round.length) {
      const fresh = plan.round.filter(item => item.state === memory.State.New).length;
      landing.append(el('h2', '', '从一个词开始'),
        el('p', 'muted', `本轮 ${plan.round.length} 张：复习 ${plan.round.length - fresh} · 新词 ${fresh}。先回忆，再看答案。`),
        button('开始复习', startRound, 'button primary'));
    } else {
      landing.append(el('h2', '', limited ? '今日新词已学完' : '今天的节奏刚刚好'),
        el('p', 'muted', plan.upcoming.length ? '下次复习：' + when(plan.upcoming[0].record, plan.upcoming[0].at)
          : book.length ? '暂无已安排的复习。' : '先收藏几个想学的词，它们会出现在这里。'));
    }
    if (limited) landing.append(el('p', 'notice', `今日新词上限 ${settings.newPerDay} 个已用完，还有 ${plan.fresh.length} 个新词，凌晨 4:00 后继续。可在设置中调整上限。`));
    view.append(stats, landing);
    if (book.length) {
      const insight = el('section', 'section review-insight');
      const retention = retentionStats([...book, ...recalls], now);
      insight.append(el('h3', '', '学习情况'), el('p', 'notice', retention.total
        ? `近 30 天长期复习记得率 ${Math.round(retention.passed / retention.total * 100)}%（${retention.total} 次），目标 ${Math.round(settings.retention * 100)}%。`
        : '完成长期复习后，这里会显示近 30 天的真实记得率。'));
      if (plan.backlog) insight.append(el('p', 'notice', '到期复习较多，本轮优先安排最可能遗忘的词。'));
      const leeches = [...new Set([...book, ...(settings.reverse ? recalls : [])].filter(isLeech).map(item => item.word))];
      if (leeches.length) {
        insight.append(el('p', 'notice leech', `难记词 ${leeches.length} 个（忘记 ≥ ${LEECH_LAPSES} 次）：${leeches.slice(0, 8).join('、')}${leeches.length > 8 ? ' 等' : ''}。建议结合原句、词根或自己造句来记。`));
      }
      view.append(insight);
    }
    if (plan.upcoming.length) {
      const list = el('section', 'section review-plan');
      list.append(el('h3', '', '接下来的复习'), el('p', 'notice', '记住后仍会定期强化，间隔随每次反馈调整；长期复习从到期日凌晨 4:00 起可复习。'));
      for (const item of plan.upcoming.slice(0, 6)) {
        const row = el('div', 'setting');
        row.append(el('span', 'term', item.word), el('span', 'meta', (item.kind === 'recall' ? '反向 · ' : '') + when(item.record, item.at)));
        list.append(row);
      }
      if (plan.upcoming.length > 6) list.append(el('p', 'notice', `最近 6 / ${plan.upcoming.length} 个安排，全部时间可在生词本查看。`));
      view.append(list);
    }
  }
  function undoButton() {
    return button('撤销上一次', undo, 'button', `撤销 ${review.undoWord} 的评分（Ctrl/⌘+Z）`);
  }
  function renderReviewWait(now, dueAt) {
    // 用会话的实际下一张学习卡设定计时，避免概览刷新打断本轮。
    const remaining = dueAt - now;
    reviewTimer = setTimeout(() => {
      if (!overlay.hidden && screen === 'review') render();
    }, Math.max(1, remaining > LEARN_AHEAD ? remaining - LEARN_AHEAD : remaining));
    const card = el('div', 'review');
    const heading = el('h2', '', '等待下一张学习卡');
    heading.tabIndex = -1;
    card.append(heading, el('p', 'muted', `下一张 ${date(dueAt)} 到期，到期后自动继续本轮。`));
    const actions = el('div', 'actions review-actions');
    if (remaining <= LEARN_AHEAD) actions.append(button('现在提前复习', () => { review.takeEarly(); render(); }));
    actions.append(button('返回复习概览', () => { review.reset(); render(); }));
    if (review.undoWord) actions.append(undoButton());
    card.append(actions);
    view.append(card);
    heading.focus({ preventScroll: true });
  }
  function renderRoundDone(now) {
    const plan = review.plan(now);
    refreshLater(now, plan);
    const card = el('div', 'review');
    const available = plan.learning.length + plan.reviews.length + plan.newToday;
    card.append(el('h2', '', '本轮已完成'), el('p', 'muted', available ? `进度已保存，还有 ${available} 张待学。`
      : plan.upcoming.length ? '进度已保存。下次复习：' + when(plan.upcoming[0].record, plan.upcoming[0].at) : '进度已保存。'));
    const actions = el('div', 'actions review-actions');
    const back = button('返回复习概览', () => { review.reset(); render(); }, 'button primary');
    actions.append(back);
    if (plan.round.length) actions.append(button('继续下一轮', startRound));
    if (review.undoWord) actions.append(undoButton());
    card.append(actions);
    view.append(card);
    back.focus({ preventScroll: true });
  }
  function setReviewGradeGuide(trigger, guide, open) {
    guide.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
  }
  function closeReviewGradeGuide() {
    const guide = view.querySelector('.review-grade-guide');
    if (!guide || guide.hidden) return false;
    const trigger = view.querySelector('.review-grade-help');
    setReviewGradeGuide(trigger, guide, false);
    trigger.focus({ preventScroll: true });
    return true;
  }
  function renderCard(entry) {
    const word = entry.word;
    const wordEntry = get('word:' + word);
    const record = entry.record;
    const answer = review.revealed;
    const recall = entry.kind === 'recall';
    const autoLoad = !cleanSettings(get('settings', {})).reviewCacheOnly;
    const chinese = recall ? chineseText(wordEntry).trim() : '';
    const direction = !recall ? '看英文想含义' : chinese ? '反向 · 看中文想英文' : '反向 · 看英文释义想单词';
    const card = el('div', 'review');
    card.append(el('div', 'muted', `${direction} · ${STUDY_STATES[stateOf(record)]} · 本轮剩余 ${review.remaining}`));
    if (isLeech(record)) card.append(el('p', 'notice leech', `难记词：已忘记 ${record.fsrs.lapses} 次。试试结合原句、词根或自己造句。`));
    const context = reviewContexts.get(word);
    let focusTarget;
    if (recall) {
      const prompt = el('div', 'recall-prompt');
      const promptText = value => answer ? value : maskWord(value, word);
      if (chinese) prompt.append(el('div', 'translation-copy', promptText(chinese)));
      else {
        for (const def of wordEntry.meanings.flatMap(meaning => meaning.definitions).slice(0, 3)) {
          prompt.append(el('p', 'definition', promptText(def.definition)));
        }
      }
      card.append(prompt);
      if (context) card.append(contextLine(context, !answer ? word : ''));
      if (answer) card.append(el('h2', 'word', word), phoneticBlock(wordEntry, autoLoad));
    } else {
      card.append(el('h2', 'word', word), phoneticBlock(wordEntry, autoLoad));
      if (context) card.append(contextLine(context));
    }
    if (!answer) {
      const reveal = button(recall ? '显示单词' : '显示释义', () => showAnswer(entry), 'button primary');
      card.append(el('p', 'muted', recall
        ? '先回想这个英文单词；可以直接评分，也可先显示答案核对'
        : '先回忆这个词的含义；可以直接评分，也可先显示释义'));
      if (recall) {
        const spelling = el('input', 'spelling');
        spelling.placeholder = '拼写（可选），Enter 显示答案';
        spelling.setAttribute('aria-label', '拼写英文单词（可选）');
        spelling.autocomplete = 'off';
        spelling.spellcheck = false;
        spelling.maxLength = 64;
        spelling.value = review.typed;
        spelling.addEventListener('input', () => review.type(entry, spelling.value));
        spelling.addEventListener('keydown', event => {
          if (event.key === 'Enter') { event.preventDefault(); Promise.resolve().then(() => showAnswer(entry)).catch(showError); }
        });
        card.append(spelling);
        focusTarget = spelling;
      }
      card.append(reveal);
      focusTarget ||= reveal;
    } else {
      const typed = normalize(review.typed);
      if (recall && review.typed.trim()) {
        card.append(el('p', typed === word ? 'spell ok' : 'spell bad', typed === word ? '✓ 拼写正确'
          : `✗ 你写的是“${review.typed.trim()}”，答错请选“忘记”`));
      }
      const back = el('div', 'review-answer');
      back.append(senses(wordEntry, autoLoad));
      if (!recall) back.append(chineseDefinitions(wordEntry, autoLoad));
      back.append(examplesBlock(wordEntry, autoLoad));
      card.append(back);
    }
    const actions = el('div', 'review-grades');
    const guide = el('section', 'review-grade-guide');
    guide.id = 'review-grade-guide';
    const help = button('', () => setReviewGradeGuide(help, guide, guide.hidden), 'icon review-grade-help', '评分说明');
    help.setAttribute('aria-controls', guide.id);
    setReviewGradeGuide(help, guide, false);
    const mark = el('span', '', '?');
    mark.setAttribute('aria-hidden', 'true');
    help.append(mark);
    const grades = el('dl');
    for (const [index, [grade, label, hint, effect]] of [
      ['again', '忘记', '没想起来，或答案不正确', '新词回到第一个学习步骤；已学词记一次遗忘，短间隔重学。'],
      ['hard', '困难', '想对了，但回忆很吃力', '留在当前学习步骤；已学词通常比选「记得」更早复习。'],
      ['good', '记得', '能够正确回忆', '进入下一学习步骤，或按正常间隔安排下次复习。'],
      ['easy', '轻松', '无需费力就想起来了', '可跳过剩余学习步骤，通常比选「记得」更晚复习。']
    ].entries()) {
      const action = button(label, () => gradeCard(entry, grade), grade === 'good' ? 'button primary' : 'button',
        `${label}；${hint}；快捷键 ${index + 1}`);
      if (grade === 'good' && answer) focusTarget = action;
      actions.append(action);
      const row = el('div');
      const term = el('dt');
      term.append(el('kbd', '', String(index + 1)), document.createTextNode(label));
      const detail = el('dd', '', hint);
      detail.append(el('span', 'muted', effect));
      row.append(term, detail);
      grades.append(row);
    }
    actions.append(help);
    guide.append(el('h3', '', '怎么给这次回忆评分？'), el('p', 'muted', '按这次回忆的表现选择，不是按单词本身的难度。'), grades,
      el('p', 'muted grade-note', '具体复习时间取决于这张卡的学习阶段、复习记录和目标记得率。'));
    card.append(actions, guide);
    if (review.undoWord) {
      const extra = el('div', 'actions review-actions');
      extra.append(undoButton());
      card.append(extra);
    }
    card.append(el('p', 'notice', '快捷键：空格显示答案，1–4 评分，R 发音，Ctrl/⌘+Z 撤销。关闭或离开后，已完成的复习仍会保留。'));
    view.append(card);
    focusTarget.focus({ preventScroll: true });
  }
  function download(name, blob) {
    const url = URL.createObjectURL(blob);
    const anchor = el('a');
    anchor.href = url; anchor.download = name;
    shadow.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    message('已发起导出，请确认浏览器下载记录');
  }
  function exportBackup() {
    const data = snapshot();
    validateBackup(data);
    const file = new Blob([JSON.stringify(data)], { type: 'application/json' });
    checkBackupSize(file.size);
    download(`lexi-backup-${new Date().toISOString().slice(0, 10)}.json`, file);
  }
  function exportCsv(isBook) {
    const data = snapshot();
    const words = new Map(data.words.map(item => [item.word, item]));
    const records = isBook ? data.book : data.history;
    const recalls = new Map(data.recall.map(item => [item.word, item]));
    const rows = [isBook ? ['单词', '英文释义', '中文辅助', '学习状态', '下次复习', '复习次数', '遗忘次数', '反向学习状态', '反向下次复习']
      : ['查询时间', '单词', '英文释义', '中文辅助', '阅读上下文', '来源']];
    for (const item of records) {
      const entry = words.get(item.word);
      const definition = entry?.meanings[0]?.definitions[0]?.definition || '';
      const reverse = recalls.get(item.word);
      rows.push(isBook ? [item.word, definition, chineseText(entry), STUDY_STATES[item.fsrs.state], new Date(item.dueAt).toISOString(),
        item.reviews, item.fsrs.lapses, reverse ? STUDY_STATES[reverse.fsrs.state] : '', reverse ? new Date(reverse.dueAt).toISOString() : '']
        : [new Date(item.at).toISOString(), item.word, definition, chineseText(entry), item.context, item.sourceUrl]);
    }
    download(`lexi-${isBook ? 'book' : 'history'}-${new Date().toISOString().slice(0, 10)}.csv`,
      new Blob([csv(rows)], { type: 'text/csv;charset=utf-8' }));
  }
  async function importFile(file, restoreRules = false) {
    if (!file) return;
    checkBackupSize(file.size);
    let parsed;
    try { parsed = JSON.parse(await file.text()); } catch { throw new Error('无法读取 JSON 备份，未导入数据'); }
    const incoming = validateBackup(parsed);
    function prepare() {
      const local = snapshot();
      if (restoreRules) {
        const combined = new Map([...local.siteRules, ...incoming.siteRules].map(rule => [ruleKey(rule), rule]));
        validateSiteRules([...combined.values()]);
      }
      const retention = local.settings.retention;
      const summary = { added: 0, replayed: 0, incomplete: 0, unchangedLog: 0 };
      const merged = mergeBackup(local, incoming, retention, summary);
      const details = `新增进度：${summary.added} 张\n合并并重放：${summary.replayed} 张\n日志不全，保留较新进度：${summary.incomplete} 张\n无需重放，保留较新进度：${summary.unchangedLog} 张` +
        (summary.replayed ? `\n重放使用本机目标记得率 ${Math.round(retention * 100)}%，可能改变下次复习日期。` : '');
      return { merged, details };
    }
    const { details } = prepare();
    const reverseCount = incoming.recall.length ? `（含 ${incoming.recall.length} 个反向卡进度）` : '';
    if (!confirm(`合并 ${incoming.words.length} 个词条、${incoming.history.length} 条历史、${incoming.book.length} 个生词进度${reverseCount}？\n\n${details}\n\n重复历史不会增加，设置保持当前值。建议先导出当前备份。`)) return;
    if (restoreRules && !confirm(`同时添加备份中的 ${incoming.siteRules.length} 条网页禁用规则？\n本机已有规则保留，添加后可能立即禁用当前网页。`)) return;
    const latest = prepare();
    if (latest.details !== details) throw new Error('确认期间本机复习进度或设置已变化，未导入数据，请重新选择备份');
    const { merged } = latest;
    try {
      writeLearningData(merged);
      if (restoreRules) {
        for (const rule of incoming.siteRules) put(ruleKey(rule), rule);
        syncSite();
        put('scope-revision', crypto.randomUUID());
      }
      notify(); review.reset(); render(); message('合并完成，重复历史已去重');
    } catch { throw new Error('写入中断，部分记录可能已导入；原记录未主动删除，可再次导入继续合并'); }
  }
  function renderSites() {
    view.append(el('h1', 'heading', '网页管理'), el('p', 'subheading', '默认启用，按页面或域名记录禁用范围'));
    const scope = el('div', 'scope-manager');
    const current = el('section', 'scope-current');
    const state = readSiteState();
    const reason = [state.pageDisabled && '页面禁用规则', state.domainDisabled && '域名禁用规则'].filter(Boolean).join('、');
    const address = el('p', 'meta scope-address', state.page);
    address.title = state.page;
    current.append(el('p', '', state.disabled ? '当前网页已禁用：' + reason : '当前网页已启用（默认开启）'),
      address, el('p', 'meta', '当前域名：' + state.domain));
    const scopeActions = el('div', 'actions');
    for (const [type, label] of [['page', '此页面'], ['domain', '此域名']]) {
      const disabled = state[type + 'Disabled'];
      scopeActions.append(button(disabled ? '解除' + label + '禁用' : '禁用' + label + (type === 'domain' ? '…' : ''),
        () => changeSiteRule({ type, value: state[type] }, !disabled)));
    }
    current.append(scopeActions);
    const help = el('details', 'scope-help');
    help.append(el('summary', '', '匹配规则与恢复说明'), el('p', 'notice', '页面规则忽略查询参数和普通锚点，保留 #/ 与 #!/ 路由路径；域名规则不包含其他子域名。禁用后无常驻 L，可通过油猴菜单管理或手动打开学习中心，不会解除规则。'));
    const toolbar = el('div', 'scope-toolbar');
    const ruleSearch = el('input', 'scope-filter');
    ruleSearch.placeholder = '搜索已禁用的页面或域名';
    ruleSearch.setAttribute('aria-label', '搜索禁用规则');
    ruleSearch.value = scopeFilter;
    const count = el('span', 'meta scope-count');
    toolbar.append(ruleSearch, count);
    const ruleList = el('div', 'scope-rule-list');
    ruleList.tabIndex = 0;
    ruleList.setAttribute('role', 'region');
    ruleList.setAttribute('aria-label', '已禁用的页面和域名');
    const pager = createPager('', direction => { scopePage += direction; renderRules(); });
    const rules = readSiteRules();
    const renderRules = () => {
      const matches = rules.filter(rule => rule.value.toLowerCase().includes(scopeFilter.trim().toLowerCase()));
      scopePage = pager.update(matches.length, scopePage);
      count.textContent = `${matches.length} / ${rules.length} 条`;
      ruleList.replaceChildren();
      ruleList.scrollTop = 0;
      if (!matches.length) ruleList.append(el('p', 'notice', rules.length ? '没有匹配的禁用规则' : '还没有禁用规则'));
      for (const rule of matches.slice(scopePage * PAGE_SIZE, (scopePage + 1) * PAGE_SIZE)) {
        const row = el('div', 'scope-rule');
        const address = el('span', 'scope-address', rule.value);
        address.title = rule.value;
        row.append(el('span', 'scope-kind', rule.type === 'page' ? '页面' : '域名'), address,
          button('解除', () => changeSiteRule(rule, false), 'button scope-remove', '解除禁用：' + rule.value));
        ruleList.append(row);
      }
    };
    ruleSearch.addEventListener('input', () => {
      scopeFilter = ruleSearch.value; scopePage = 0;
      try { renderRules(); } catch (error) { showError(error); }
    });
    renderRules();
    scope.append(current, help, toolbar, ruleList, pager.node);
    view.append(scope);
  }
  let syncBusy = false;
  let syncMessage = '';
  let refreshSyncStatus;
  function renderNutstore() {
    const section = el('section', 'section');
    const config = get('nutstore-sync', null);
    const account = el('input'); account.type = 'email'; account.autocomplete = 'off';
    account.placeholder = '输入坚果云账号邮箱';
    account.value = config?.account || ''; account.maxLength = 254;
    const folder = el('input'); folder.autocomplete = 'off'; folder.spellcheck = false;
    folder.value = config?.folder || 'Lexi'; folder.maxLength = 80;
    const field = (label, input) => {
      const row = el('label', 'sync-field');
      row.append(el('span', '', label), input);
      return row;
    };
    const status = el('p', 'notice');
    status.setAttribute('role', 'status');
    const save = button('保存同步配置', () => {
      if (syncBusy) return;
      const email = account.value.trim();
      const name = folder.value.trim();
      if (!email || /[:\s\x00-\x1f\x7f]/.test(email) || email.length > 254) throw new Error('请输入正确的坚果云账号');
      if (!name || name === '.' || name === '..' || /[\\/:*?"<>|\x00-\x1f\x7f]/.test(name) || name.length > 80) {
        throw new Error('请输入已创建的一级文件夹名称，不要填写路径或网址');
      }
      const previous = get('nutstore-sync', null);
      const existing = previous?.account === email ? previous.password : '';
      const answer = prompt('请输入坚果云第三方应用密码（不是登录密码）。此对话框中输入内容可见。' +
        (existing ? '\n留空可保留原应用密码。' : ''));
      if (answer === null) return;
      const password = answer.trim() || existing;
      if (!password || password.length > 512 || /[\x00-\x1f\x7f]/.test(password)) throw new Error('请输入有效的第三方应用密码');
      put('nutstore-sync', { account: email, folder: name, password,
        lastSyncAt: existing === password && previous?.folder === name ? previous.lastSyncAt || 0 : 0 });
      syncMessage = '同步配置已保存，尚未联网。';
      refreshSyncStatus();
    });
    const sync = button('立即同步', async () => {
      if (syncBusy) return;
      const saved = get('nutstore-sync', null);
      if (!saved) throw new Error('请先保存坚果云同步配置');
      if (account.value.trim() !== saved.account || folder.value.trim() !== saved.folder) throw new Error('请先保存修改后的同步配置');
      syncBusy = true;
      syncMessage = '正在连接坚果云并合并数据…';
      refreshSyncStatus();
      try {
        const result = await syncWithNutstore(saved);
        syncMessage = result.message;
        if (result.changed) {
          review.reset();
          if (!overlay.hidden && screen !== 'settings') render();
        }
        message(result.message);
      } catch (error) {
        syncMessage = error.message || '同步失败，请重试';
        showError(error);
      } finally {
        syncBusy = false;
        refreshSyncStatus();
      }
    }, 'button primary');
    const clear = button('清除同步配置', () => {
      if (syncBusy) return;
      remove('nutstore-sync');
      account.value = ''; folder.value = 'Lexi';
      syncMessage = '已清除本机同步配置；云端和本机词库均保留。';
      refreshSyncStatus();
    });
    refreshSyncStatus = () => {
      const saved = get('nutstore-sync', null);
      const lastSync = saved?.lastSyncAt ? `上次成功：${new Date(saved.lastSyncAt).toLocaleString()}` : '';
      status.textContent = [syncMessage || (saved ? '已配置，等待手动同步。' : '未配置同步。'), lastSync].filter(Boolean).join(' · ');
      account.disabled = folder.disabled = save.disabled = syncBusy;
      sync.disabled = clear.disabled = syncBusy || !saved;
    };
    refreshSyncStatus();
    const actions = el('div', 'actions');
    actions.append(save, sync, clear);
    section.append(el('h3', '', '坚果云同步'),
      el('p', 'notice', '仅点击「立即同步」时联网。先在坚果云创建一个私有一级文件夹（例如 Lexi），在每台设备上使用同一账号和文件夹。'),
      link('如何生成第三方应用密码 ↗', SYNC_HELP), field('坚果云账号', account), field('同步文件夹', folder),
      el('p', 'notice', '点「保存同步配置」后，在弹窗里输入第三方应用密码（不是坚果云登录密码）。'),
      actions, status,
      el('p', 'notice', '双向合并词条、查词历史（含已保存的阅读上下文和来源）、生词本和复习进度。不传播删除或撤销，其他设备保留的数据可能重新出现。设置与网页禁用规则不同步；应用密码仅保存在本机 Tampermonkey 存储，不写入备份。'));
    return section;
  }
  function renderSettings() {
    const heading = el('h1', 'heading settings-heading', '设置与数据');
    heading.append(el('span', 'settings-version', 'v' + GM_info.script.version));
    view.append(heading, el('p', 'subheading', '跨网站共用，数据保存在本机油猴存储'));
    const save = (key, value, revert, resetReview = true) => {
      try {
        const next = cleanSettings({ ...get('settings', {}), [key]: value });
        put('settings', next); settings = next; notify();
        if (resetReview) review.reset();
      } catch (error) { revert(); showError(error); }
    };
    const preferences = el('section', 'section');
    preferences.append(el('h3', '', '阅读偏好'));
    for (const [key, label] of [['auto', '自动划词查询'], ['autoBook', '查词直接进入生词本'], ['context', '保存阅读上下文与来源（仅本地）']]) {
      const row = el('label', 'setting');
      const toggle = el('input'); toggle.type = 'checkbox'; toggle.checked = Boolean(settings[key]);
      toggle.addEventListener('change', () => {
        try {
          settings = cleanSettings({ ...get('settings', {}), [key]: toggle.checked });
          put('settings', settings); notify();
        } catch (error) { toggle.checked = !toggle.checked; showError(error); }
      });
      row.append(el('span', '', label), toggle); preferences.append(row);
    }
    const markerRow = el('label', 'setting');
    const markerSeconds = el('input', 'reading-marker-seconds');
    Object.assign(markerSeconds, { type: 'number', min: '0', max: '300', step: '1', value: String(settings.readingMarkerSeconds) });
    markerSeconds.addEventListener('change', () => {
      const value = Number(markerSeconds.value);
      if (!markerSeconds.value.trim() || !Number.isInteger(value) || value < 0 || value > 300) {
        markerSeconds.value = String(settings.readingMarkerSeconds);
        message('原文高亮保留时间需为 0–300 的整数秒');
        return;
      }
      save('readingMarkerSeconds', value, () => { markerSeconds.value = String(settings.readingMarkerSeconds); }, false);
    });
    markerRow.append(el('span', '', '关闭查词后原文高亮保留时间（秒）'), markerSeconds);
    preferences.append(markerRow, el('p', 'notice', '查词期间持续标记原文，关闭后按设定时间淡出，默认 3 秒；0 秒表示关闭后立即移除。原词滚出屏幕时可点击“回到原文”，不会自动滚动页面。外观跟随系统深浅色，发音仅在点击后播放。'));
    const study = el('section', 'section');
    study.append(el('h3', '', '复习'));
    const limitRow = el('label', 'setting');
    const limit = el('input', 'number');
    Object.assign(limit, { type: 'number', min: '0', max: '200', step: '1', value: String(settings.newPerDay) });
    limit.addEventListener('change', () => {
      const value = Number(limit.value);
      if (!Number.isInteger(value) || value < 0 || value > 200) { limit.value = String(settings.newPerDay); message('每日新词上限需为 0–200 的整数'); return; }
      save('newPerDay', value, () => { limit.value = String(settings.newPerDay); });
    });
    limitRow.append(el('span', '', '每日新词上限'), limit);
    const retentionRow = el('label', 'setting');
    const retention = el('select');
    for (const value of RETENTIONS) {
      const option = el('option', '', `${Math.round(value * 100)}%${value === 0.9 ? '（推荐）' : ''}`);
      option.value = String(value);
      retention.append(option);
    }
    retention.value = String(settings.retention);
    retention.addEventListener('change', () => save('retention', Number(retention.value), () => { retention.value = String(settings.retention); }));
    retentionRow.append(el('span', '', '目标记得率'), retention);
    const reverseRow = el('label', 'setting');
    const reverse = el('input'); reverse.type = 'checkbox'; reverse.checked = settings.reverse;
    reverse.addEventListener('change', () => save('reverse', reverse.checked, () => { reverse.checked = settings.reverse; }));
    reverseRow.append(el('span', '', '加入反向卡（看中文想英文）'), reverse);
    const cacheRow = el('label', 'setting');
    const cacheOnly = el('input'); cacheOnly.type = 'checkbox'; cacheOnly.checked = settings.reviewCacheOnly;
    cacheOnly.addEventListener('change', () => save('reviewCacheOnly', cacheOnly.checked, () => { cacheOnly.checked = settings.reviewCacheOnly; }, false));
    cacheRow.append(el('span', '', '复习仅用缓存'), cacheOnly);
    study.append(limitRow, retentionRow, reverseRow, cacheRow, el('p', 'notice',
      '开启后，复习卡不自动联网补全音标、词形、用法例句或中文释义；仍可手动获取。发音可能联网，不影响查词。'), el('p', 'notice',
      '每天凌晨 4:00 开始新的学习日。记得率越高，间隔越短、复习越多，只影响之后的安排。反向卡在该词进入长期复习后加入，计入新词上限，进度独立保存；关闭后暂停反向卡，进度保留。'));
    const chinese = el('section', 'section');
    chinese.append(el('h3', '', '中文释义'), el('p', 'notice', '英文释义的机器翻译与有道中文词典释义同时显示、分别缓存。有道释义不与英文逐条对应；每路独立显示加载、失败与重试状态，一路失败不影响另一路。'));
    const translationRow = el('label', 'setting fallback-setting');
    const translationFallback = el('select', 'translation-fallback');
    for (const [value, label] of [['google', '开启自动回落（默认）'], ['none', '关闭备用翻译']]) {
      const option = el('option', '', label); option.value = value; translationFallback.append(option);
    }
    translationFallback.value = settings.translationFallback;
    translationFallback.addEventListener('change', () => save('translationFallback', translationFallback.value, () => { translationFallback.value = settings.translationFallback; }, false));
    translationRow.append(el('span', '', '中文释义和句子的备用翻译'), translationFallback);
    chinese.append(translationRow, el('p', 'notice', '单词释义优先 MyMemory，失败时回落至 Google Translate；句子翻译优先 Google Translate，失败后依次尝试 Microsoft Translator 和 MyMemory。关闭备用翻译后仅使用首选来源，只停止新增备用请求，已有单词缓存保留。句子原文和译文仅本次显示，不保存。有道始终独立显示。Google 和微软 Edge 的非公开无密钥接口不保证可用性。'));
    const phonetics = el('section', 'section');
    phonetics.append(el('h3', '', '音标'));
    const phoneticRow = el('label', 'setting fallback-setting');
    const phoneticFallback = el('select', 'phonetic-fallback');
    for (const [value, label] of [['datamuse', 'Datamuse（默认）'], ['none', '关闭额外备用来源']]) {
      const option = el('option', '', label); option.value = value; phoneticFallback.append(option);
    }
    phoneticFallback.value = settings.phoneticFallback;
    phoneticFallback.addEventListener('change', () => save('phoneticFallback', phoneticFallback.value, () => { phoneticFallback.value = settings.phoneticFallback; }, false));
    phoneticRow.append(el('span', '', '缺少音标时的备用来源（fallback）'), phoneticFallback);
    phonetics.append(phoneticRow, el('p', 'notice', '优先获取有道音标，失败时保留主词典音标；两者都没有时，自动向 Datamuse 查询当前词的美式参考 IPA，不使用原形或相近词。成功后缓存并标注来源。罕见词可能由服务按拼写推测；关闭只停止新增备用请求。'),
      el('p', 'notice', 'Datamuse 官方公告自 2027-02-01 起要求 API key；本版未配置 key，届时该备用接口可能不可用。仍保留缓存、主词典音标及浏览器朗读。'));
    const data = el('section', 'section');
    data.append(el('h3', '', '备份与迁移'));
    const actions = el('div', 'actions');
    actions.append(button('导出 JSON 备份', exportBackup),
      button('导出历史 CSV', () => exportCsv(false)), button('导出生词 CSV', () => exportCsv(true)));
    const upload = el('input'); upload.type = 'file'; upload.accept = '.json,application/json'; upload.hidden = true;
    const restoreRow = el('label', 'setting');
    const restoreRules = el('input'); restoreRules.type = 'checkbox'; restoreRules.checked = false;
    restoreRow.append(el('span', '', '导入时添加备份中的网页禁用规则（另行确认）'), restoreRules);
    upload.addEventListener('change', () => { importFile(upload.files?.[0], restoreRules.checked).catch(showError); upload.value = ''; });
    actions.append(button('导入 JSON 合并', () => upload.click()));
    data.append(actions, upload, restoreRow, el('p', 'notice', `JSON 包含完整历史、复习进度和网页禁用规则，导出与导入上限均为 ${BACKUP_MIB} MiB。导入默认保留本机设置与禁用规则，CSV 便于表格查看。`));
    const privacy = el('section', 'section');
    privacy.append(el('h3', '', '服务与隐私'), el('p', 'notice', '查词会向 Free Dictionary API 发送当前单词；缺少对应缓存时，向 MyMemory 发送最多 6 条英文释义、向有道发送当前单词，分别获取并同时显示两路中文。句子翻译先向 Google Translate 发送所选原文，启用回落时失败后依次发送给 Microsoft Translator 和 MyMemory；句子原文和译文不保存到本插件，第三方是否留存由其政策决定。获取音标和词形同样向有道发送单词，词形补全可能另查原形；进行中的有道请求复用。启用额外音标备用来源后，在有道失败且主词典无音标时向 Datamuse 发送当前单词。单词结果成功后本地保存，再次打开直接读取。网页上下文不会发送给词典服务。在线音频和浏览器朗读可能联网。服务可用性、内容与额度由提供方决定。'),
      link('Free Dictionary API', 'https://dictionaryapi.dev/'), document.createTextNode(' · '),
      link('MyMemory', 'https://mymemory.translated.net/doc/spec.php'), document.createTextNode(' · '),
      link('Google Translate', 'https://translate.google.com/'), document.createTextNode(' · '),
      link('Microsoft Translator', 'https://www.microsoft.com/translator/'), document.createTextNode(' · '),
      link('有道词典', 'https://www.youdao.com/'), document.createTextNode(' · '),
      link('Datamuse', 'https://www.datamuse.com/api/'));
    const cleanup = el('section', 'section');
    cleanup.append(el('h3', '', '清理数据'));
    const cleanActions = el('div', 'actions');
    cleanActions.append(button('清空查词历史', () => {
      if (!confirm('清空全部查词事件？词条缓存、生词本和复习进度会保留。建议先导出备份。')) return;
      for (const key of GM_listValues().filter(key => key.startsWith(PREFIX + 'event:'))) GM_deleteValue(key);
      notify(); render(); message('查词历史已清空');
    }, 'button danger'), button('删除全部 Lexi 数据', () => {
      if (prompt('此操作不可撤销，请先导出备份。输入“删除全部”以清除本机所有 Lexi 数据与同步配置（不删除云端文件）：') !== '删除全部') return;
      stopActivity();
      for (const key of GM_listValues().filter(key => key.startsWith(PREFIX))) GM_deleteValue(key);
      settings = { ...DEFAULTS }; selectedWord = ''; review.reset();
      launcherPosition = null; positionLauncher();
      scopeFilter = ''; scopePage = 0;
      syncMessage = '';
      for (const state of Object.values(libraryState)) Object.assign(state, { filter: '', page: 0 });
      syncSite(); put('scope-revision', crypto.randomUUID());
      notify(); render(); message('Lexi 数据已删除');
    }, 'button danger'));
    cleanup.append(cleanActions);
    view.append(preferences, study, chinese, phonetics, renderNutstore(), data, privacy, cleanup);
  }

  document.addEventListener('pointerup', event => {
    selectionPointerDown = false;
    rememberSelectionPointer(event);
    if (!checkSite()) return;
    clearTimeout(selectionTimer);
    if (internalPointerDown) {
      internalPointerDown = false;
      scheduleInternalSelection();
      return;
    }
    if (event.composedPath().includes(host)) {
      if (usesSelectionAction(event)) updateSelectionAction();
      return;
    }
    if (currentSite.disabled || event.button !== 0 || !overlay.hidden || !settings.auto) return;
    const target = event.target;
    if (target instanceof Element && target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
    selectionTimer = setTimeout(() => {
      if (!checkSite()) return;
      if (currentSite.disabled || !settings.auto || !overlay.hidden) return;
      if (usesSelectionAction(event)) {
        updateSelectionAction();
        return;
      }
      clearSelectionAction();
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return;
      const anchor = selection.anchorNode?.parentElement;
      if (anchor?.closest('input,textarea,[contenteditable]:not([contenteditable="false"])')) return;
      const raw = selection.toString();
      const query = classifyQuery(raw);
      if (!query) return;
      if (query.type === 'sentence' && query.value.length > MAX_SENTENCE_LENGTH) {
        message(`英文翻译最多支持 ${MAX_SENTENCE_LENGTH} 个字符，请缩短后重试`);
        return;
      }
      const range = selection.getRangeAt(0);
      if (query.value === lastSelection && Date.now() - lastSelectionAt < 1200) {
        captureReadingMarker(range, query.type === 'sentence');
        if (popover.hidden) releaseReadingMarker();
        return;
      }
      lastSelection = query.value; lastSelectionAt = Date.now(); lastSelectionTransient = query.type === 'sentence';
      let context = null;
      if (query.type === 'word' && settings.context) {
        const block = anchor?.closest('p,li,td,blockquote,figcaption') || anchor;
        const body = block?.textContent || '';
        const index = body.toLowerCase().indexOf(raw.toLowerCase());
        const url = new URL(location.href); url.search = ''; url.hash = '';
        context = {
          context: body.slice(Math.max(0, index - 90), Math.max(0, index - 90) + 300).replace(/\s+/g, ' '),
          title: text(document.title, 120), sourceUrl: safeUrl(url.href)
        };
      }
      captureReadingMarker(range, query.type === 'sentence');
      lookup(query.value, range.getBoundingClientRect(), context).catch(showError);
    }, 220);
  });
  window.addEventListener('resize', () => {
    updateViewport();
    finishLauncherDrag();
    positionLauncher();
    cancelInternalSelection();
    updateReadingMarker();
    if (!popover.hidden) positionPopover(null, true);
    scheduleSelectionActionUpdate();
  });
  function onVisualViewportChange() {
    if (!compact && !touchViewport?.matches) return;
    updateViewport();
    if (!popover.hidden) positionPopover(null, true);
    scheduleSelectionActionUpdate();
  }
  visualViewport?.addEventListener('resize', onVisualViewportChange);
  visualViewport?.addEventListener('scroll', onVisualViewportChange);
  document.addEventListener('scroll', updateReadingMarker, true);
  document.addEventListener('pointerdown', event => {
    selectionPointerDown = true;
    rememberSelectionPointer(event);
    if (!event.composedPath().includes(host)) {
      internalPointerDown = false;
      cancelInternalSelection();
      if (!popover.hidden) closePopover();
    }
  });
  document.addEventListener('pointercancel', () => { selectionPointerDown = false; });
  return {
    applySite, refresh, showError,
    open: nextScreen => {
      if (!host.isConnected) document.documentElement.append(host);
      launcher.hidden = currentSite.disabled;
      openStudio(nextScreen);
    }
  };
  }
  GM_addValueChangeListener(PREFIX + 'revision', (_name, _old, _next, remote) => {
    if (remote) { try { ui?.refresh(); } catch (error) { reportError(error); } }
  });
  GM_addValueChangeListener(PREFIX + 'scope-revision', (_name, _old, _next, remote) => {
    if (remote) { try { syncSite(); ui?.refresh(true); } catch (error) { reportError(error); } }
  });
  const checkSite = () => {
    try { syncSite(); return true; }
    catch (error) { reportError(error); return false; }
  };
  window.addEventListener('focus', () => {
    try { syncSite(); ui?.refresh(true); } catch (error) { reportError(error); }
  });
  window.addEventListener('popstate', checkSite);
  window.addEventListener('hashchange', checkSite);
  // History changes in a userscript's isolated world are not reliably observable by patching pushState.
  let lastAddress = location.href;
  function watchAddress() {
    if (location.href !== lastAddress) { lastAddress = location.href; checkSite(); }
    setTimeout(watchAddress, 500);
  }
  setTimeout(watchAddress, 500);
  checkSite();
})();
