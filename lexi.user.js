// ==UserScript==
// @name         Lexi · 划词词典与复习
// @namespace    lexi-local
// @version      0.3.0
// @description  英文划词、发音、跨网站历史、生词复习与本地备份。无需账号。
// @match        http://*/*
// @match        https://*/*
// @noframes
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// @connect      api.dictionaryapi.dev
// @connect      api.mymemory.translated.net
// @connect      dict.youdao.com
// @license      MIT
// ==/UserScript==

(() => {
  'use strict';
  const memory = (() => {
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
  const DEFAULTS = { auto: true, autoBook: false, context: false, newPerDay: 20, retention: 0.9, reverse: false };
  const cleanSettings = raw => {
    const value = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
    if (!Number.isInteger(value.newPerDay) || value.newPerDay < 0 || value.newPerDay > 200) value.newPerDay = DEFAULTS.newPerDay;
    if (!RETENTIONS.includes(value.retention)) value.retention = DEFAULTS.retention;
    return value;
  };
  const normalize = value => {
    if (typeof value !== 'string') return '';
    const word = value.trim().replace(/[‘’]/g, "'")
      .replace(/^[\s'"“”([{]+|[\s'"“”.,!?;:)\]}]+$/g, '').toLowerCase();
    return word.length <= 64 && /^[a-z]+(?:[-'][a-z]+)*$/.test(word) ? word : '';
  };
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
  // 使提前到 4:00 复习的卡片按学习日计算已过天数。结果按相对时长换算回真实时间。
  const learningClock = time => time - new Date(time).getTimezoneOffset() * 60000 - DAY_START_HOUR * 3600000;
  function fsrsInput(record, now) {
    const prior = memoryCard(record);
    const card = { ...prior, due: new Date(learningClock(prior.due.getTime())) };
    if (prior.last_review) card.last_review = new Date(learningClock(prior.last_review.getTime()));
    return { prior, card, at: learningClock(now) };
  }
  function finish(record, grade, card, prior, now, at) {
    card.due = new Date(now + card.due.getTime() - at);
    if (card.last_review) card.last_review = new Date(now);
    // 上游为区分反馈可能超出最大间隔 1–2 天，在存储和预览前统一限制为一年。
    if (card.scheduled_days > MAX_REVIEW_DAYS) {
      card.scheduled_days = MAX_REVIEW_DAYS;
      card.due = new Date(now + MAX_REVIEW_DAYS * DAY);
    }
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
  function nextDayStart(now) {
    const day = new Date(dayStart(now));
    day.setDate(day.getDate() + 1);
    return day.getTime();
  }
  const stateOf = record => record.fsrs ? record.fsrs.state : memoryCard(record).state;
  // 长期复习卡按学习日到期；学习／重学卡仍按精确时间。
  const availableAt = record => stateOf(record) === memory.State.Review ? dayStart(record.dueAt) : record.dueAt;
  const isLeech = record => (record.fsrs?.lapses || 0) >= LEECH_LAPSES;
  function shuffleKey(value) {
    let hash = 2166136261;
    for (const char of value) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
    return hash >>> 0;
  }
  // cards: [{ kind, word, record, order?, sibling? }]，sibling 为同一词另一方向的记录。
  function planReview(cards, now, { newPerDay = 20, retention, size = ROUND_SIZE } = {}) {
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
    const introduced = cards.filter(card => card.record.log?.[0]?.state === 0 && card.record.log[0].at >= start).length;
    const newLeft = Math.max(0, newPerDay - introduced);
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
  function contextParts(raw, word) {
    if (typeof raw !== 'string' || !word) return null;
    const found = new RegExp(`(^|[^a-z'’-])(${word.replace(/'/g, "['’]")})(?![a-z'’-])`, 'i').exec(raw);
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
  function youdaoPhonetic(raw, word) {
    const records = [raw?.simple?.word, raw?.ec?.word].flatMap(items => Array.isArray(items) ? items : []);
    for (const item of records) {
      const phrase = item?.['return-phrase'];
      if (normalize(typeof phrase === 'string' ? phrase : phrase?.l?.i) !== word) continue;
      const value = [item.ukphone, item.usphone, item.phone].find(value =>
        typeof value === 'string' && value.trim() && value.length <= 148);
      if (value) return '/' + value.trim().replace(/^\/|\/$/g, '') + '/';
    }
    throw new Error('暂未找到该词的音标，可稍后重试');
  }
  function dictionary(raw, word, now) {
    if (!Array.isArray(raw) || !raw.length) throw new Error('词典返回格式异常');
    const entries = raw.filter(entry => entry && typeof entry === 'object');
    const phonetics = entries.flatMap(entry => Array.isArray(entry.phonetics) ? entry.phonetics : []).filter(Boolean);
    const meanings = entries.flatMap(entry => Array.isArray(entry.meanings) ? entry.meanings : [])
      .filter(item => item && Array.isArray(item.definitions)).slice(0, 5).map(item => ({
        partOfSpeech: text(item.partOfSpeech, 50),
        definitions: item.definitions.filter(item => item && typeof item.definition === 'string' && item.definition.trim())
          .slice(0, 3).map(item => ({ definition: text(item.definition), example: text(item.example, 600) }))
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
  function validateBackup(raw) {
    const fail = () => { throw new Error('备份格式无效或版本不兼容，未导入数据'); };
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    const timestamp = value => Number.isSafeInteger(value) && value > 0 && value <= 8640000000000000;
    const validWord = value => typeof value === 'string' && normalize(value) === value && value !== '';
    const string = (value, max) => typeof value === 'string' && value.length <= max;
    if (!object(raw) || ![1, 2, 3].includes(raw.schemaVersion) || !['words', 'history', 'book'].every(key => Array.isArray(raw[key]))) fail();
    if (raw.schemaVersion === 3 ? !Array.isArray(raw.recall) : raw.recall !== undefined) fail();
    const recall = raw.recall || [];
    if (raw.words.length > 10000 || raw.history.length > 30000 || raw.book.length > 10000 || recall.length > 10000) fail();
    const unique = (items, key) => new Set(items.map(item => item[key])).size === items.length;
    if (![...raw.words, ...raw.history, ...raw.book, ...recall].every(object)) fail();
    if (!unique(raw.words, 'word') || !unique(raw.book, 'word') || !unique(recall, 'word') || !unique(raw.history, 'id')) fail();
    const words = raw.words.map(item => {
      if (!validWord(item.word) || !timestamp(item.fetchedAt) || !string(item.phonetic, 150) ||
        !Array.isArray(item.meanings) || !item.meanings.length || item.meanings.length > 5) fail();
      const meanings = item.meanings.map(meaning => {
        if (!object(meaning) || !string(meaning.partOfSpeech, 50) || !Array.isArray(meaning.definitions) ||
          !meaning.definitions.length || meaning.definitions.length > 3) fail();
        return {
          partOfSpeech: meaning.partOfSpeech, definitions: meaning.definitions.map(def => {
            if (!object(def) || !string(def.definition, 1200) || !def.definition.trim() || !string(def.example, 600)) fail();
            return { definition: def.definition, example: def.example };
          })
        };
      });
      if (item.translation !== undefined && (!string(item.translation, 16000) || !timestamp(item.translatedAt))) fail();
      if (item.translationSource !== undefined && (!item.translation || !string(item.translationSource, 8000))) fail();
      if (item.phoneticSource !== undefined && (item.phoneticSource !== 'youdao' || !item.phonetic.trim())) fail();
      return {
        word: item.word, fetchedAt: item.fetchedAt, phonetic: item.phonetic.trim(), meanings,
        ...(item.phoneticSource ? { phoneticSource: item.phoneticSource } : {}),
        audio: audioUrl(item.audio), sourceUrl: safeUrl(item.sourceUrl),
        license: { name: text(item.license?.name, 120), url: safeUrl(item.license?.url) },
        ...(item.translation ? {
          translation: item.translation, translatedAt: item.translatedAt,
          ...(item.translationSource ? { translationSource: item.translationSource } : {})
        } : {})
      };
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
    return { schemaVersion: 3, words, history, book, recall: recallBook };
  }
  function mergeBackup(current, incoming, retention) {
    const words = new Map(current.words.map(item => [item.word, item]));
    for (const item of incoming.words) {
      const old = words.get(item.word);
      const newer = !old || item.fetchedAt > old.fetchedAt ? item : old;
      const translation = [old, item].filter(value => value?.translation && translationMatches(value, newer))
        .sort((a, b) => b.translatedAt - a.translatedAt)[0];
      const combined = { ...newer };
      const phonetic = [newer, old, item].find(value => value?.phonetic?.trim());
      if (phonetic) {
        combined.phonetic = phonetic.phonetic;
        delete combined.phoneticSource;
        if (phonetic.phoneticSource) combined.phoneticSource = phonetic.phoneticSource;
      }
      delete combined.translation;
      delete combined.translatedAt;
      delete combined.translationSource;
      words.set(item.word, {
        ...combined, ...(translation ? {
          translation: translation.translation, translatedAt: translation.translatedAt,
          ...(translation.translationSource ? { translationSource: translation.translationSource } : {})
        } : {})
      });
    }
    const history = new Map(current.history.map(item => [item.id, item]));
    for (const item of incoming.history) {
      const old = history.get(item.id);
      if (old && (old.word !== item.word || old.at !== item.at)) throw new Error('历史 ID 冲突，未导入数据');
      if (!old) history.set(item.id, item);
    }
    const book = new Map(current.book.map(item => [item.word, item]));
    for (const item of incoming.book) book.set(item.word, mergeProgress(book.get(item.word), item, retention));
    const recall = new Map((current.recall || []).map(item => [item.word, item]));
    for (const item of incoming.recall || []) recall.set(item.word, mergeProgress(recall.get(item.word), item, retention));
    return { words: [...words.values()], history: [...history.values()], book: [...book.values()], recall: [...recall.values()] };
  }
  const logKey = entry => entry.at + ':' + entry.rating;
  function mergeProgress(current, incoming, retention) {
    if (!current) return incoming;
    const newer = incoming.updatedAt > current.updatedAt ? incoming : current;
    const other = newer === incoming ? current : incoming;
    const known = new Set((newer.log || []).map(logKey));
    const extra = (other.log || []).filter(entry => !known.has(logKey(entry)));
    if (!extra.length) return newer;
    const complete = record => (record.log || []).length === record.reviews;
    const log = [...(newer.log || []), ...extra].sort((a, b) => a.at - b.at || a.rating - b.rating);
    // 只有两端都保留从新词开始的完整日志时才能重放；否则保留较新的整条记录。
    if (!complete(newer) || !complete(other) || log[0].state !== memory.State.New) return newer;
    const grades = Object.keys(GRADES);
    let state = createStudy(newer.word, Math.min(newer.addedAt, other.addedAt));
    for (const entry of log) state = schedule(state, grades[entry.rating - 1], entry.at, retention);
    return state;
  }
  const ordered = (events, oldest = false) => [...events].sort((a, b) =>
    (oldest ? 1 : -1) * (a.at - b.at || a.id.localeCompare(b.id)));
  if (typeof window === 'undefined') {
    module.exports = { normalize, schedule, scheduleAll, migrateStudy, createStudy, reviewInterval, csv, dictionary, validateBackup, mergeBackup, ordered, audioUrl, translationSource, translationChunks, youdaoPhonetic,
      dayStart, nextDayStart, availableAt, planReview, retentionStats, contextParts, isLeech };
    return;
  }

  const get = (key, fallback) => GM_getValue(PREFIX + key, fallback);
  const put = (key, value) => GM_setValue(PREFIX + key, value);
  const remove = key => GM_deleteValue(PREFIX + key);
  const notify = () => put('revision', crypto.randomUUID());
  const all = type => GM_listValues().filter(key => key.startsWith(PREFIX + type + ':')).map(key => GM_getValue(key)).filter(Boolean);
  const snapshot = () => ({
    schemaVersion: 3, exportedAt: new Date().toISOString(),
    words: all('word'), history: ordered(all('event'), true), book: all('study').map(migrateStudy),
    recall: all('recall').map(migrateStudy), settings: cleanSettings(get('settings', {}))
  });
  const date = value => new Date(value).toLocaleString('zh-CN', { hour12: false });
  const when = (record, at = availableAt(record)) => stateOf(record) === memory.State.Review
    ? new Date(at).toLocaleDateString('zh-CN') : date(at);
  let settings = cleanSettings(get('settings', {}));
  let queryEpoch = 0;
  let activeRequest;
  let activeAudio;
  let audioEpoch = 0;
  let ownSpeech = false;
  let selectedWord = '';
  let selectedEvent = null;
  let screen = 'history';
  let filter = '';
  let oldest = false;
  let round = null;
  let answer = null;
  let reviewTimer;
  let returnFocus;
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
      if (!overlay.hidden && !shadow.activeElement) input.focus();
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
    .launcher{pointer-events:auto;position:fixed;right:24px;bottom:24px;width:46px;height:46px;border:1px solid #ffffff40;border-radius:16px;background:var(--accent);color:white;box-shadow:0 6px 25px #102a2025;font:italic 28px Georgia,serif}
    .popover{pointer-events:auto;position:fixed;width:min(380px,calc(100vw - 24px));max-height:70vh;overflow:auto;background:var(--surface);border:1px solid var(--line);border-radius:18px;box-shadow:0 16px 65px #102a2026;padding:22px}
    .bar,.row,.actions{display:flex;align-items:center;gap:10px}.bar{justify-content:space-between}.actions{flex-wrap:wrap}.brand{font-weight:750;letter-spacing:3px;font-size:12px}.muted,.meta{color:var(--muted);font-size:12px}.meta{margin-top:4px}.word{font:42px/1.2 Georgia,"Times New Roman",serif;overflow-wrap:anywhere;margin:20px 0 6px}.phonetic{color:var(--muted);font-size:14px;margin-bottom:14px}
    .button,.icon,.tab{border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:10px;padding:8px 13px;transition:background .12s}.button:hover,.icon:hover{background:var(--tint)}.primary{background:var(--accent);color:white;border-color:var(--accent)}.primary:hover{filter:brightness(1.1);background:var(--accent)}.icon{padding:5px 9px;font-size:16px}.danger{color:var(--error)}.active{background:var(--tint);border-color:var(--accent);color:var(--accent)}
    .sense{border-top:1px solid var(--line);padding-top:15px;margin-top:18px}.pos{display:inline-block;color:var(--accent);font-size:12px;font-weight:650;margin-bottom:6px}.definition{margin:0 0 10px;line-height:1.75}.example{color:var(--muted);border-left:2px solid var(--line);padding-left:10px;margin:5px 0 14px;font-size:13px}.translation{background:var(--tint);padding:14px;border-radius:10px;margin-top:14px}.source{border-top:1px solid var(--line);margin-top:20px;padding-top:12px;display:flex;flex-wrap:wrap;gap:8px;font-size:11px}.link{color:var(--accent);text-decoration:none}.link:hover{text-decoration:underline}.context{font-size:13px;margin-top:18px;color:var(--muted);overflow-wrap:anywhere}.error{color:var(--error)}
    .overlay{pointer-events:auto;position:fixed;inset:0;background:#0d211f55;backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:24px}.studio{background:var(--paper);border:1px solid var(--line);border-radius:24px;box-shadow:0 30px 100px #081d2038;width:min(1060px,100%);height:min(760px,90vh);display:grid;grid-template-columns:166px minmax(0,1fr);overflow:hidden}.sidebar{padding:28px 18px;background:var(--surface);border-right:1px solid var(--line);display:flex;flex-direction:column;gap:8px}.logo{font:italic 34px Georgia,serif;margin:0 10px}.sidebar .muted{margin:0 10px 28px}.tab{text-align:left;border-color:transparent;background:transparent;padding:11px 14px}.tab.active{background:var(--tint);color:var(--accent);font-weight:650}.sidebar .footnote{margin-top:auto;font-size:11px;color:var(--muted);padding:12px}
    .main{min-width:0;display:flex;flex-direction:column}.top{padding:22px 26px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--line)}.search{display:flex;gap:8px;flex:1;min-width:0}input,select{color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:9px 12px;min-width:0}input{width:100%}input::placeholder{color:var(--muted)}.view{padding:24px 26px;overflow:auto;min-height:0;flex:1}.heading{font-size:24px;letter-spacing:-.5px;margin:0;font-weight:650}.subheading{font-size:13px;color:var(--muted);margin:5px 0 22px}.split{display:grid;grid-template-columns:240px minmax(0,1fr);gap:24px}.list{display:flex;flex-direction:column;gap:6px;margin-top:12px;max-height:440px;overflow:auto;padding:4px}.item{display:block;width:100%;text-align:left;padding:11px 12px;border-radius:12px;background:transparent;border:1px solid transparent;color:var(--ink)}.item:hover{background:var(--surface)}.item.active{background:var(--tint);border-color:var(--line)}.item .term{font:22px Georgia,serif}.detail{min-width:0}.detail .word{margin-top:8px}.empty{color:var(--muted);text-align:center;padding:45px 15px;font-size:14px}.section{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px;margin:16px 0}.section h3{margin:0 0 14px;font-size:15px}.setting{display:flex;justify-content:space-between;align-items:center;gap:14px;margin:16px 0}.setting input{width:18px;height:18px;accent-color:var(--accent)}.notice{font-size:12px;color:var(--muted);margin-top:12px}.review{text-align:center;max-width:540px;margin:25px auto}.review .word{font-size:54px;margin:35px 0 12px}.review-answer{text-align:left;margin:25px 0}.stats{display:flex;gap:12px;margin:24px 0}.stat{flex:1;padding:18px;background:var(--surface);border:1px solid var(--line);border-radius:15px}.stat strong{display:block;font:32px Georgia,serif;color:var(--accent)}.toast{pointer-events:auto;position:fixed;left:50%;bottom:25px;transform:translateX(-50%);max-width:calc(100vw - 32px);background:var(--ink);color:var(--surface);padding:12px 20px;border-radius:12px;box-shadow:0 5px 25px #0002;z-index:2}
    @media(prefers-color-scheme:dark){:host{--paper:#15201d;--surface:#1b2823;--ink:#e4ede5;--muted:#9aada1;--line:#304238;--accent:#9fd2b1;--tint:#263c30;--error:#f1a19b;color-scheme:dark}.primary,.launcher{background:#38684d;color:#fff;border-color:#497a5d}.primary:hover{background:#38684d}}
    @media(max-width:760px){.overlay{padding:10px}.studio{grid-template-columns:1fr;height:95vh;border-radius:18px}.sidebar{padding:12px;flex-direction:row;align-items:center;border-right:0;border-bottom:1px solid var(--line);gap:3px;flex-wrap:wrap}.sidebar .logo{font-size:25px;margin-right:auto}.sidebar .muted,.footnote{display:none}.tab{padding:7px 10px}.main{min-height:0}.top{padding:14px}.view{padding:18px}.split{grid-template-columns:1fr}.list{max-height:170px}.detail{border-top:1px solid var(--line);padding-top:18px}.review .word{font-size:40px}.stats{gap:6px}.stat{padding:12px}.launcher{right:16px;bottom:16px}}
    @media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
  `;
  const app = el('div', 'app');
  style.textContent += `
    .toast{pointer-events:none}
    input,select{border:0;outline:none;box-shadow:none}
    .search input{font-size:18px;line-height:1.5;padding:8px 12px}
    .list{gap:2px;margin-top:8px;padding:2px}
    .item{padding:6px 10px;border:0;border-radius:9px}
    .item .term{font-size:21px;line-height:1.2;overflow-wrap:anywhere}
    .item .meta{margin-top:2px;font-size:11px;line-height:1.4}
    .translation-copy{white-space:pre-line;line-height:1.85}
    .logo .version{font:11px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--muted);margin-left:6px;white-space:nowrap}
    .phonetic{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.phonetic .icon{border:0;background:transparent;transition:transform .12s,color .12s,opacity .12s}.phonetic .icon:active{transform:scale(.85);color:var(--accent);opacity:.6}.phonetic .link{font-size:11px}.phonetic .button{font-size:12px;padding:2px 8px}.review>.phonetic{justify-content:center}
    *{overscroll-behavior:contain}
    ::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:transparent}
    ::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--muted) 42%,transparent);border-radius:8px}
    ::-webkit-scrollbar-thumb:hover{background:color-mix(in srgb,var(--muted) 65%,transparent)}
    ::-webkit-scrollbar-button{display:none;width:0;height:0}
    @supports not selector(::-webkit-scrollbar){*{scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--muted) 42%,transparent) transparent}}
    .studio{grid-template-rows:minmax(0,1fr)}.main,.sidebar{min-height:0}.main{overflow:hidden}.sidebar{overflow:auto}.top{flex-shrink:0}
    .view.library{display:flex;flex-direction:column;overflow:hidden}.library>.heading,.library>.subheading{flex-shrink:0}
    .library .split{flex:1;min-height:0;grid-template-rows:minmax(0,1fr)}.library-list{display:flex;flex-direction:column;min-width:0;min-height:0}.library-list>.row{flex-shrink:0}
    .library .list{flex:1;min-height:0;max-height:none}.detail-pane{overflow:auto;min-height:0;padding:3px 8px 3px 3px}
    .list:focus-visible,.detail-pane:focus-visible{outline:2px solid #75ac8c;outline-offset:-2px}
    .library-row{position:relative;flex-shrink:0}.library-row>.item{padding-right:42px}.history-row>.item{padding-right:70px}
    .library-row:hover>.item{background:var(--surface)}.library-row:hover>.item.active{background:var(--tint)}
    .row-actions{position:absolute;right:5px;top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:2px}
    .list-star,.history-delete{border:0;background:transparent;padding:4px 7px;line-height:1;border-radius:8px}
    .list-star:focus-visible,.history-delete:focus-visible{outline-offset:0}
    .list-star{color:var(--muted);font-size:17px}.list-star.starred{color:var(--accent)}
    .list-star:hover{color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,transparent)}
    .history-delete{opacity:0;pointer-events:none}
    .history-row:hover .history-delete,.history-row:focus-within .history-delete{opacity:1;pointer-events:auto}
    .history-delete:hover{background:color-mix(in srgb,var(--error) 12%,transparent)}
    @media(hover:none){.history-delete{opacity:1;pointer-events:auto}}
    @media(max-width:760px){.studio{grid-template-rows:auto minmax(0,1fr)}.library .split{grid-template-rows:minmax(0,2fr) minmax(0,3fr);gap:16px}}
    .stats{flex-wrap:wrap}.stat{min-width:110px}
    .context-line{margin:14px auto 4px;max-width:480px;color:var(--muted);font:15px/1.7 Georgia,"Times New Roman",serif;overflow-wrap:anywhere}
    .context-line mark{background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--ink);border-radius:4px;padding:0 3px}
    .context-line .cloze{color:var(--accent);font-weight:650;letter-spacing:1px}
    .recall-prompt{text-align:left;background:var(--tint);border-radius:12px;padding:16px;margin:25px 0 6px}.recall-prompt .definition{margin:0 0 6px}
    .spelling{display:block;width:min(320px,100%);margin:6px auto 14px;text-align:center;font:20px Georgia,serif;background:var(--surface);border:1px solid var(--line)}
    .spell{font-weight:650}.spell.ok{color:var(--accent)}.spell.bad,.leech{color:var(--error)}
    .review-actions{justify-content:center;margin-top:14px}.review .actions{justify-content:center}
    .setting input.number{width:80px;height:auto;text-align:right;border:1px solid var(--line)}
  `;
  const launcher = button('L', () => openStudio(), 'launcher', '打开 Lexi 学习中心');
  const popover = el('section', 'popover');
  popover.setAttribute('role', 'region');
  popover.setAttribute('aria-label', 'Lexi 查词结果');
  popover.hidden = true;
  const overlay = el('div', 'overlay');
  overlay.hidden = true;
  const studio = el('section', 'studio');
  studio.setAttribute('role', 'dialog');
  studio.setAttribute('aria-modal', 'true');
  studio.setAttribute('aria-label', 'Lexi 学习中心');
  const sidebar = el('nav', 'sidebar');
  sidebar.setAttribute('aria-label', '学习导航');
  const logo = el('div', 'logo', 'Lexi');
  logo.append(el('span', 'version', 'v' + GM_info.script.version));
  sidebar.append(logo, el('div', 'muted', '个人词汇库'));
  const navButtons = {};
  for (const [key, label] of [['history', '查词历史'], ['book', '生词本'], ['review', '复习'], ['settings', '设置']]) {
    navButtons[key] = button(label, () => { screen = key; filter = ''; render(); }, 'tab');
    sidebar.append(navButtons[key]);
  }
  sidebar.append(el('div', 'footnote', '本地保存 · 无需账号'));
  const main = el('main', 'main');
  const top = el('header', 'top');
  const form = el('form', 'search');
  const input = el('input');
  input.placeholder = '输入英文单词，按 Enter 查词';
  input.setAttribute('aria-label', '查询英文单词');
  input.autocomplete = 'off';
  input.maxLength = 80;
  form.append(input, button('查询', () => lookup(input.value), 'button primary'));
  form.addEventListener('submit', event => { event.preventDefault(); lookup(input.value).catch(showError); });
  top.append(form, button('×', closeStudio, 'icon', '关闭学习中心'));
  const view = el('div', 'view');
  const toast = el('div', 'toast');
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.hidden = true;
  main.append(top, view);
  studio.append(sidebar, main);
  overlay.append(studio);
  app.append(launcher, popover, overlay, toast);
  shadow.append(style, app);
  let toastTimer;
  function message(value) {
    toast.textContent = value;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
  }
  const showError = error => message(error?.message || '操作失败，请重试');
  function stopQuery() { queryEpoch++; activeRequest?.abort(); activeRequest = null; }
  function stopAudio() {
    audioEpoch++;
    activeAudio?.pause();
    activeAudio = null;
    if (ownSpeech) window.speechSynthesis?.cancel();
    ownSpeech = false;
  }
  function closePopover() { popover.hidden = true; stopQuery(); stopAudio(); }
  function openStudio(nextScreen) {
    returnFocus = shadow.activeElement || document.activeElement;
    closePopover();
    if (nextScreen) screen = nextScreen;
    overlay.hidden = false;
    render();
    if (!studio.contains(shadow.activeElement)) input.focus();
  }
  function closeStudio() {
    overlay.hidden = true;
    clearTimeout(reviewTimer);
    stopQuery();
    stopAudio();
    if (returnFocus?.getClientRects().length) returnFocus.focus?.();
    else launcher.focus();
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
    if (event.key === 'Escape') { event.stopPropagation(); overlay.hidden ? closePopover() : closeStudio(); }
    if (!overlay.hidden && screen === 'review' && round && !event.altKey && !event.repeat) {
      let handled = false;
      try { handled = reviewKey(event); } catch (error) { handled = true; showError(error); }
      if (handled) { event.preventDefault(); event.stopPropagation(); return; }
    }
    if (event.key !== 'Tab' || overlay.hidden) return;
    const focusable = [...studio.querySelectorAll('button,a,input,select,[tabindex="0"]')].filter(node => !node.disabled && node.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (!focusable.includes(shadow.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
    else if (event.shiftKey && shadow.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && shadow.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !popover.hidden) closePopover();
  });

  function request(url, lookupRequest = false) {
    let timer;
    let handle;
    const pending = new Promise((resolve, reject) => {
      // Anonymous requests force fetch mode, whose native timeout is ignored on Chrome.
      timer = setTimeout(() => { reject(new Error('请求超时，请稍后重试')); handle?.abort(); }, 10000);
      handle = GM_xmlhttpRequest({
        method: 'GET', url, timeout: 10000, anonymous: true,
        onload: response => {
          if (response.status === 404) { reject(new Error('没有找到这个词，试试原形或其他拼写')); return; }
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
      if (lookupRequest) activeRequest = handle;
    });
    return pending.finally(() => clearTimeout(timer));
  }
  function positionPopover(rect) {
    popover.hidden = false;
    const width = Math.min(380, window.innerWidth - 24);
    const left = Math.max(12, Math.min(rect?.left ?? window.innerWidth - width - 24, window.innerWidth - width - 12));
    const height = popover.getBoundingClientRect().height;
    const below = (rect?.bottom ?? 80) + 10;
    const top = below + height < window.innerHeight - 12 ? below : Math.max(12, (rect?.top ?? 80) - height - 10);
    popover.style.left = left + 'px';
    popover.style.top = Math.min(top, Math.max(12, window.innerHeight - height - 12)) + 'px';
  }
  function popHeader() {
    const bar = el('div', 'bar');
    bar.append(el('span', 'brand', 'LEXI · 英语词典'), button('×', closePopover, 'icon', '关闭查词卡'));
    return bar;
  }
  async function lookup(raw, rect, context = null) {
    const word = normalize(raw);
    if (!word) { message('请输入单个英文单词，支持内部连字符和撇号'); return; }
    stopQuery();
    const epoch = queryEpoch;
    const showPopup = overlay.hidden;
    if (showPopup) {
      popover.replaceChildren(popHeader(), el('h2', 'word', word), el('p', 'muted', '正在查词…'));
      positionPopover(rect);
    } else message(`正在查询 ${word}…`);
    let entry = get('word:' + word);
    let stale = false;
    try {
      if (!entry || Date.now() - entry.fetchedAt > 7 * DAY) {
        try {
          const response = await request('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word), true);
          if (epoch !== queryEpoch) return;
          const fresh = dictionary(response, word, Date.now());
          const cached = get('word:' + word);
          if (cached?.phonetic?.trim() && (cached.phoneticSource === 'youdao' || !fresh.phonetic)) {
            fresh.phonetic = cached.phonetic;
            if (cached.phoneticSource) fresh.phoneticSource = cached.phoneticSource;
          }
          if (entry?.translation && translationMatches(entry, fresh)) {
            Object.assign(fresh, {
              translation: entry.translation, translatedAt: entry.translatedAt,
              ...(entry.translationSource ? { translationSource: entry.translationSource } : {})
            });
          }
          entry = fresh;
        } catch (error) {
          if (epoch !== queryEpoch) return;
          if (!entry) throw error;
          stale = true;
        }
      }
      if (epoch !== queryEpoch) return;
      put('word:' + word, entry);
      const now = Date.now();
      const event = { id: crypto.randomUUID(), word, at: now, ...(context || {}) };
      put('event:' + event.id, event);
      settings = cleanSettings(get('settings', {}));
      if (settings.autoBook && !get('study:' + word)) put('study:' + word, createStudy(word, now));
      selectedWord = word;
      selectedEvent = event;
      notify();
      if (showPopup) {
        popover.replaceChildren(popHeader(), wordDetail(entry, event));
        if (stale) popover.append(el('p', 'notice', '使用离线缓存 · 暂未能更新释义'));
        popover.append(button('打开学习中心 ↗', () => openStudio('history'), 'button'));
        positionPopover(rect);
      } else {
        if (toast.textContent === `正在查询 ${word}…`) toast.hidden = true;
        screen = 'history'; filter = ''; render();
        if (stale) message('使用离线缓存 · 暂未能更新释义');
      }
    } catch (error) {
      if (epoch !== queryEpoch) return;
      if (showPopup) {
        popover.replaceChildren(popHeader(), el('h2', 'word', word), el('p', 'error', error.message),
          button('重试', () => lookup(word, rect, context)));
        positionPopover(rect);
      } else showError(error);
    } finally { if (epoch === queryEpoch) activeRequest = null; }
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
  async function translate(entry, target) {
    target.replaceChildren(el('div', 'muted', '正在补全中文释义…'));
    const source = translationSource(entry);
    const key = entry.word + '\n' + source;
    try {
      if (!translations.has(key)) {
        const pending = (async () => {
          const translated = [];
          for (const chunk of translationChunks(source)) {
            if (!get('word:' + entry.word)) throw new Error('词条已删除，请重新查询');
            const result = await request('https://api.mymemory.translated.net/get?langpair=en%7Czh-CN&q=' + encodeURIComponent(chunk));
            const value = result?.responseData?.translatedText;
            if (Number(result?.responseStatus) !== 200 || result?.quotaFinished || typeof value !== 'string' || !value.trim()) {
              throw new Error('中文服务暂不可用或额度已用尽，可稍后重试');
            }
            translated.push(value.trim());
          }
          const current = get('word:' + entry.word);
          if (!current) throw new Error('词条已删除，请重新查询');
          if (translationSource(current) !== source) throw new Error('词典释义已更新，请重新获取中文');
          const translation = translated.join('\n');
          if (translation.length > 16000) throw new Error('中文响应过长，请稍后重试');
          const updated = { ...current, translation, translationSource: source, translatedAt: Date.now() };
          put('word:' + entry.word, updated);
          notify();
          return updated;
        })();
        translations.set(key, pending);
        pending.finally(() => translations.delete(key)).catch(() => { });
      }
      const updated = await translations.get(key);
      target.replaceChildren(translationBlock(updated));
    } catch (error) {
      target.replaceChildren();
      if (entry.translation) target.append(translationBlock(entry));
      target.append(el('p', 'notice', error.message), button('重试中文释义', () => translate(entry, target)));
    }
  }
  function translationBlock(entry) {
    const node = el('div', 'translation');
    node.append(el('div', 'translation-copy', entry.translation),
      el('div', 'meta', entry.translationSource ? '多条释义 · MyMemory 机器翻译' : 'MyMemory 机器翻译'));
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
    if (rerender && !overlay.hidden) render();
    return true;
  }
  function senses(entry) {
    const container = el('div');
    for (const meaning of entry.meanings) {
      const section = el('section', 'sense');
      section.append(el('div', 'pos', meaning.partOfSpeech || '释义'));
      meaning.definitions.forEach((def, index) => {
        section.append(el('p', 'definition', `${meaning.definitions.length > 1 ? index + 1 + '. ' : ''}${def.definition}`));
        if (def.example) section.append(el('p', 'example', def.example));
      });
      container.append(section);
    }
    return container;
  }
  const pronunciations = new Map();
  function phoneticBlock(entry) {
    const node = el('div', 'phonetic');
    const show = current => {
      node.title = '';
      node.replaceChildren(el('span', '', current.phonetic), button('▷', () => speak(entry), 'icon', '播放单词发音'));
      if (current.phoneticSource === 'youdao') node.append(link('有道音标', 'https://www.youdao.com/result?word=' + encodeURIComponent(entry.word) + '&lang=en'));
    };
    async function load() {
      show(entry.phonetic.trim() ? entry : { ...entry, phonetic: '正在获取有道音标…' });
      try {
        if (!pronunciations.has(entry.word)) {
          const pending = (async () => {
            const raw = await request('https://dict.youdao.com/jsonapi?q=' + encodeURIComponent(entry.word)
              + '&dicts=' + encodeURIComponent(JSON.stringify({ count: 1, dicts: [['ec']] })));
            const phonetic = youdaoPhonetic(raw, entry.word);
            const current = get('word:' + entry.word);
            if (!current) throw new Error('词条已删除，请重新查询');
            if (current.phonetic.trim() && current.phoneticSource === 'youdao') return current;
            const updated = { ...current, phonetic, phoneticSource: 'youdao' };
            put('word:' + entry.word, updated);
            notify();
            return updated;
          })();
          pronunciations.set(entry.word, pending);
          pending.finally(() => pronunciations.delete(entry.word)).catch(() => { });
        }
        show(await pronunciations.get(entry.word));
      } catch (error) {
        const current = get('word:' + entry.word) || entry;
        show(current.phonetic.trim() ? current : { ...current, phonetic: '音标暂不可用' });
        if (current.phonetic.trim()) node.append(el('span', '', '有道音标暂不可用'));
        node.append(button('重试', load));
        node.title = error.message;
      }
    }
    if (entry.phonetic.trim() && entry.phoneticSource === 'youdao') show(entry); else load();
    return node;
  }
  function wordDetail(entry, event = null, allowStar = true) {
    const node = el('article', 'detail');
    const title = el('div', 'bar');
    const actions = el('div', 'actions');
    if (allowStar) {
      const star = button(get('study:' + entry.word) ? '已收藏' : '＋ 收藏', () => {
        if (toggleStar(entry.word)) star.textContent = get('study:' + entry.word) ? '已收藏' : '＋ 收藏';
      });
      actions.append(star);
    }
    node.append(el('h2', 'word', entry.word));
    title.append(phoneticBlock(entry));
    title.append(actions);
    node.append(title);
    node.append(senses(entry));
    const chinese = el('div');
    node.append(chinese);
    if (entry.translation && entry.translationSource === translationSource(entry)) chinese.append(translationBlock(entry));
    else translate(entry, chinese);
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
    return node;
  }

  function render() {
    clearTimeout(reviewTimer);
    for (const [key, node] of Object.entries(navButtons)) {
      node.classList.toggle('active', key === screen);
      if (key === screen) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current');
    }
    view.classList.toggle('library', screen === 'history' || screen === 'book');
    view.replaceChildren();
    if (screen === 'settings') { renderSettings(); return; }
    if (screen === 'review') { renderReview(); return; }
    renderLibrary();
  }
  function renderLibrary() {
    const isBook = screen === 'book';
    const records = isBook ? all('study').sort((a, b) => b.addedAt - a.addedAt || a.word.localeCompare(b.word)) : ordered(all('event'), oldest);
    view.append(el('h1', 'heading', isBook ? '生词本' : '查词历史'),
      el('p', 'subheading', isBook ? `${records.length} 个词 · 收藏的词会进入复习` : `${records.length} 次查询 · 每次成功查询都留有记录`));
    const split = el('div', 'split');
    const left = el('div', 'library-list');
    const toolbar = el('div', 'row');
    const search = el('input');
    search.placeholder = '筛选单词…';
    search.setAttribute('aria-label', '筛选已保存单词');
    search.value = filter;
    toolbar.append(search);
    if (!isBook) {
      const order = el('select');
      order.setAttribute('aria-label', '历史排序');
      for (const [value, label] of [['new', '最近'], ['old', '最早']]) {
        const option = el('option', '', label);
        option.value = value;
        order.append(option);
      }
      order.value = oldest ? 'old' : 'new';
      order.addEventListener('change', () => { oldest = order.value === 'old'; render(); });
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
    left.append(toolbar, list);
    split.append(left, detail);
    view.append(split);
    function drawDetail() {
      const entry = selectedWord && (!isBook || get('study:' + selectedWord)) ? get('word:' + selectedWord) : null;
      detail.replaceChildren(entry ? wordDetail(entry, isBook ? null : selectedEvent, false) : el('div', 'empty', '选择一个单词，或在上方开始查询'));
    }
    function drawList() {
      list.replaceChildren();
      const matches = records.filter(item => item.word.includes(filter.toLowerCase()));
      if (!matches.length) { list.append(el('div', 'empty', records.length ? '没有匹配的单词' : isBook ? '遇到想记住的词，点一下收藏' : '你的第一条查词记录会出现在这里')); return; }
      // shortcut: 一次显示最近的 300 条匹配记录，历史超过此数量时使用筛选或导出查看全量。
      for (const [index, item] of matches.slice(0, 300).entries()) {
        const row = button('', () => {
          selectedWord = item.word;
          selectedEvent = isBook ? null : item;
          drawList(); drawDetail(); detail.scrollTop = 0;
        }, 'item');
        row.classList.toggle('active', isBook ? selectedWord === item.word : selectedEvent?.id === item.id);
        row.append(el('div', 'term', item.word), el('div', 'meta', isBook ? bookMeta(item) : date(item.at)));
        const starred = Boolean(get('study:' + item.word));
        const wrapper = el('div', isBook ? 'library-row' : 'library-row history-row');
        const actions = el('div', 'row-actions');
        if (!isBook) {
          actions.append(button('×', () => {
            const scrollTop = list.scrollTop;
            const detailTop = detail.scrollTop;
            remove('event:' + item.id);
            const deletingSelected = selectedEvent?.id === item.id;
            if (deletingSelected) {
              selectedEvent = matches[index + 1] || matches[index - 1] || null;
              selectedWord = selectedEvent?.word || '';
            }
            notify(); render();
            view.querySelector('.list').scrollTop = scrollTop;
            if (!deletingSelected) view.querySelector('.detail-pane').scrollTop = detailTop;
            const deletes = view.querySelectorAll('.history-delete');
            (deletes[index] || deletes[index - 1] || view.querySelector('input')).focus({ preventScroll: true });
          }, 'icon danger history-delete', `删除 ${item.word} 的这条查询记录`));
        }
        const star = button(starred ? '★' : '☆', () => {
          const scrollTop = list.scrollTop;
          const detailTop = detail.scrollTop;
          if (!toggleStar(item.word, false)) { star.focus({ preventScroll: true }); return; }
          if (isBook) {
            const deletingSelected = selectedWord === item.word;
            if (deletingSelected) {
              selectedWord = (matches[index + 1] || matches[index - 1])?.word || '';
              selectedEvent = null;
            }
            render();
            view.querySelector('.list').scrollTop = scrollTop;
            if (!deletingSelected) view.querySelector('.detail-pane').scrollTop = detailTop;
            const stars = view.querySelectorAll('.list-star');
            (stars[index] || stars[index - 1] || view.querySelector('input')).focus({ preventScroll: true });
          } else {
            drawList();
            list.scrollTop = scrollTop;
            list.querySelectorAll('.list-star')[index]?.focus({ preventScroll: true });
          }
        }, starred ? 'icon list-star starred' : 'icon list-star', starred ? `取消收藏 ${item.word}` : `收藏 ${item.word}`);
        star.setAttribute('aria-pressed', String(starred));
        actions.append(star);
        wrapper.append(row, actions);
        list.append(wrapper);
      }
      if (matches.length > 300) list.append(el('p', 'notice', `显示前 300 / ${matches.length} 条，可继续筛选或导出全量`));
    }
    search.addEventListener('input', () => { filter = search.value; drawList(); });
    drawList(); drawDetail();
  }
  function bookMeta(item) {
    const label = stateOf(item) === memory.State.New ? '新词 · 待学习'
      : availableAt(item) <= Date.now() ? '待复习' : '下次 ' + when(item);
    return isLeech(item) ? label + ' · 难记词' : label;
  }
  const PREVIEW_LIMIT = 10 * 60000;
  const cardKey = entry => (entry.kind === 'recall' ? 'recall:' : 'study:') + entry.word;
  function reviewCards(now) {
    const book = all('study');
    const recalls = new Map(all('recall').map(item => [item.word, item]));
    const cards = book.map(record => ({
      kind: 'meaning', word: record.word, record, sibling: settings.reverse ? recalls.get(record.word) : undefined
    }));
    if (settings.reverse) {
      for (const meaning of book) {
        const record = recalls.get(meaning.word);
        if (record) cards.push({ kind: 'recall', word: meaning.word, record, sibling: meaning });
        else if (stateOf(meaning) === memory.State.Review) {
          cards.push({ kind: 'recall', word: meaning.word, record: createStudy(meaning.word, now), virtual: true, order: meaning.addedAt, sibling: meaning });
        }
      }
    }
    return { book, recalls: [...recalls.values()], cards };
  }
  const entryOf = item => ({
    kind: item.kind, word: item.word, version: item.virtual ? 0 : item.record.updatedAt, dueAt: item.record.dueAt,
    ...(item.virtual ? { virtual: true, record: item.record } : {})
  });
  function entryValid(entry) {
    if (!get('word:' + entry.word) || !get('study:' + entry.word)) return false;
    const stored = get(cardKey(entry));
    return entry.virtual ? !stored : stored?.updatedAt === entry.version;
  }
  const entryRecord = entry => entry.virtual ? entry.record : get(cardKey(entry));
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
    const now = Date.now();
    const plan = planReview(reviewCards(now).cards, now, settings);
    round = { pending: plan.round.map(entryOf), learning: [], current: null, done: 0, history: [], contexts: savedContexts(), typed: '' };
    answer = null;
    render();
  }
  function currentEntry(now) {
    while (round) {
      if (!round.current) {
        const learning = [...round.learning].sort((a, b) => a.dueAt - b.dueAt)[0];
        // 已到期的学习卡优先；没有其他卡片时提前显示（学习步骤均不超过 20 分钟）。
        const next = learning && (learning.dueAt <= now || !round.pending.length) ? learning : round.pending.shift();
        if (!next) return null;
        if (next === learning) round.learning.splice(round.learning.indexOf(learning), 1);
        round.current = next;
        round.typed = '';
        answer = null;
      }
      if (entryValid(round.current)) return round.current;
      round.current = null;
    }
    return null;
  }
  function showAnswer(entry) {
    if (round?.current !== entry || answer) return;
    const now = Date.now();
    answer = { entry, now, typed: round.typed, results: scheduleAll(entryRecord(entry), now, settings.retention) };
    render();
  }
  function gradeCard(entry, grade) {
    if (round?.current !== entry || answer?.entry !== entry) return;
    if (!entryValid(entry)) {
      round.current = null; answer = null; render(); message('该词已在其他页面更新，已跳过'); return;
    }
    const now = Date.now();
    if (now - answer.now > PREVIEW_LIMIT) {
      answer = { ...answer, now, results: scheduleAll(entryRecord(entry), now, settings.retention) };
      render(); message('显示答案已超过 10 分钟，间隔已按当前时间更新，请重新选择'); return;
    }
    const key = cardKey(entry);
    const next = answer.results[grade];
    const state = JSON.parse(JSON.stringify({ pending: round.pending, learning: round.learning, current: round.current, done: round.done }));
    const before = get(key) ?? null;
    put(key, next);
    round.history.push({ key, word: entry.word, before, after: next.updatedAt, state });
    round.done++;
    round.current = null;
    answer = null;
    if ((next.fsrs.state === memory.State.Learning || next.fsrs.state === memory.State.Relearning) && next.dueAt - now <= LEARN_AHEAD) {
      round.learning.push({ kind: entry.kind, word: entry.word, version: next.updatedAt, dueAt: next.dueAt });
    }
    stopAudio(); render();
    notify();
  }
  function undo() {
    const last = round?.history.at(-1);
    if (!last) return;
    if (get(last.key)?.updatedAt !== last.after) {
      round.history = []; render(); message('该词已在其他页面更新，无法撤销'); return;
    }
    if (last.before) put(last.key, last.before); else remove(last.key);
    round.history.pop();
    Object.assign(round, last.state, { typed: '' });
    answer = null;
    stopAudio(); render();
    notify();
    message(`已撤销 ${last.word} 的评分`);
  }
  function reviewKey(event) {
    const tag = event.composedPath()[0]?.tagName || '';
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag);
    const entry = round.current;
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
      if (typing || !round.history.length) return false;
      undo(); return true;
    }
    if (event.ctrlKey || event.metaKey || typing || !entry) return false;
    if (answer && /^[1-4]$/.test(event.key)) { gradeCard(entry, Object.keys(GRADES)[event.key - 1]); return true; }
    if (!answer && (event.key === ' ' || event.key === 'Enter') && !/^(BUTTON|A)$/.test(tag)) { showAnswer(entry); return true; }
    if (event.key.toLowerCase() === 'r' && (entry.kind === 'meaning' || answer)) { speak(get('word:' + entry.word)); return true; }
    return false;
  }
  const maskWord = (value, word) => value.replace(new RegExp(`(^|[^a-z'’-])${word.replace(/'/g, "['’]")}(?![a-z'’-])`, 'gi'), '$1＿＿');
  function contextLine(parts, cloze) {
    const node = el('p', 'context-line');
    node.title = '阅读时保存的原句';
    node.append(document.createTextNode(parts.before), cloze ? el('span', 'cloze', '＿＿＿') : el('mark', '', parts.match),
      document.createTextNode(parts.after));
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
    const entry = round && currentEntry(now);
    if (entry) renderCard(entry);
    else if (round) renderRoundDone(now);
    else renderOverview(now);
  }
  function renderOverview(now) {
    const { book, recalls, cards } = reviewCards(now);
    const plan = planReview(cards, now, settings);
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
    return button('撤销上一次', undo, 'button', `撤销 ${round.history.at(-1).word} 的评分（Ctrl/⌘+Z）`);
  }
  function renderRoundDone(now) {
    const plan = planReview(reviewCards(now).cards, now, settings);
    refreshLater(now, plan);
    const card = el('div', 'review');
    const available = plan.learning.length + plan.reviews.length + plan.newToday;
    card.append(el('h2', '', '本轮已完成'), el('p', 'muted', available ? `进度已保存，还有 ${available} 张待学。`
      : plan.upcoming.length ? '进度已保存。下次复习：' + when(plan.upcoming[0].record, plan.upcoming[0].at) : '进度已保存。'));
    const actions = el('div', 'actions review-actions');
    const back = button('返回复习概览', () => { round = null; answer = null; render(); }, 'button primary');
    actions.append(back);
    if (plan.round.length) actions.append(button('继续下一轮', startRound));
    if (round.history.length) actions.append(undoButton());
    card.append(actions);
    view.append(card);
    back.focus({ preventScroll: true });
  }
  function renderCard(entry) {
    const word = entry.word;
    const wordEntry = get('word:' + word);
    const record = entryRecord(entry);
    const recall = entry.kind === 'recall';
    const card = el('div', 'review');
    card.append(el('div', 'muted', `${recall ? '反向 · 看中文想英文' : '看英文想含义'} · ${STUDY_STATES[stateOf(record)]} · 本轮剩余 ${round.pending.length + round.learning.length + 1}`));
    if (isLeech(record)) card.append(el('p', 'notice leech', `难记词：已忘记 ${record.fsrs.lapses} 次。试试结合原句、词根或自己造句。`));
    const context = round.contexts.get(word);
    let focusTarget;
    if (recall) {
      const prompt = el('div', 'recall-prompt');
      if (wordEntry.translation) prompt.append(el('div', 'translation-copy', maskWord(wordEntry.translation, word)));
      else {
        for (const def of wordEntry.meanings.flatMap(meaning => meaning.definitions).slice(0, 3)) {
          prompt.append(el('p', 'definition', maskWord(def.definition, word)));
        }
      }
      card.append(prompt);
      if (context) card.append(contextLine(context, !answer));
      if (answer) card.append(el('h2', 'word', word), phoneticBlock(wordEntry));
    } else {
      card.append(el('h2', 'word', word), phoneticBlock(wordEntry));
      if (context) card.append(contextLine(context, false));
    }
    if (!answer) {
      const reveal = button(recall ? '显示单词' : '显示释义', () => showAnswer(entry), 'button primary');
      card.append(el('p', 'muted', recall ? '先回想这个英文单词，可在下方拼写' : '先回忆这个词的含义'));
      if (recall) {
        const spelling = el('input', 'spelling');
        spelling.placeholder = '拼写（可选），Enter 显示答案';
        spelling.setAttribute('aria-label', '拼写英文单词（可选）');
        spelling.autocomplete = 'off';
        spelling.spellcheck = false;
        spelling.maxLength = 64;
        spelling.value = round.typed;
        spelling.addEventListener('input', () => { round.typed = spelling.value; });
        spelling.addEventListener('keydown', event => {
          if (event.key === 'Enter') { event.preventDefault(); Promise.resolve().then(() => showAnswer(entry)).catch(showError); }
        });
        card.append(spelling);
        focusTarget = spelling;
      }
      card.append(reveal);
      focusTarget ||= reveal;
    } else {
      const typed = normalize(answer.typed);
      if (recall && answer.typed.trim()) {
        card.append(el('p', typed === word ? 'spell ok' : 'spell bad', typed === word ? '✓ 拼写正确'
          : `✗ 你写的是“${answer.typed.trim()}”，答错请选“忘记”`));
      }
      const back = el('div', 'review-answer');
      back.append(senses(wordEntry));
      if (!recall) {
        const chinese = el('div');
        back.append(chinese);
        if (wordEntry.translation && wordEntry.translationSource === translationSource(wordEntry)) chinese.append(translationBlock(wordEntry));
        else translate(wordEntry, chinese);
      }
      const actions = el('div', 'actions');
      for (const [index, [grade, label, hint]] of [['again', '忘记', '没想起来，或答案不正确'], ['hard', '困难', '想对了，但回忆很吃力'],
      ['good', '记得', '能够正确回忆'], ['easy', '轻松', '无需费力就想起来了']].entries()) {
        const next = answer.results[grade];
        const caption = `${label} · ${reviewInterval(next.dueAt - answer.now)}`;
        const action = button(caption, () => gradeCard(entry, grade), grade === 'good' ? 'button primary' : 'button',
          `${caption}；${hint}；快捷键 ${index + 1}；下次复习：${when(next)}`);
        if (grade === 'good') focusTarget = action;
        actions.append(action);
      }
      card.append(back, actions);
    }
    if (round.history.length) {
      const extra = el('div', 'actions review-actions');
      extra.append(undoButton());
      card.append(extra);
    }
    card.append(el('p', 'notice', '快捷键：空格显示答案，1–4 评分，R 发音，Ctrl/⌘+Z 撤销。关闭或离开后，已完成的复习仍会保留。'));
    view.append(card);
    focusTarget.focus({ preventScroll: true });
  }
  function download(name, body, type) {
    const url = URL.createObjectURL(new Blob([body], { type }));
    const anchor = el('a');
    anchor.href = url; anchor.download = name;
    shadow.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    message('已发起导出，请确认浏览器下载记录');
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
      rows.push(isBook ? [item.word, definition, entry?.translation, STUDY_STATES[item.fsrs.state], new Date(item.dueAt).toISOString(),
        item.reviews, item.fsrs.lapses, reverse ? STUDY_STATES[reverse.fsrs.state] : '', reverse ? new Date(reverse.dueAt).toISOString() : '']
        : [new Date(item.at).toISOString(), item.word, definition, entry?.translation, item.context, item.sourceUrl]);
    }
    download(`lexi-${isBook ? 'book' : 'history'}-${new Date().toISOString().slice(0, 10)}.csv`, csv(rows), 'text/csv;charset=utf-8');
  }
  async function importFile(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) throw new Error('备份超过 5 MiB，请选择较小的 Lexi JSON 文件');
    let parsed;
    try { parsed = JSON.parse(await file.text()); } catch { throw new Error('无法读取 JSON 备份，未导入数据'); }
    const incoming = validateBackup(parsed);
    // Validate conflicts before requesting confirmation or making any writes.
    mergeBackup(snapshot(), incoming, settings.retention);
    const reverseCount = incoming.recall.length ? `（含 ${incoming.recall.length} 个反向卡进度）` : '';
    if (!confirm(`合并 ${incoming.words.length} 个词条、${incoming.history.length} 条历史、${incoming.book.length} 个生词进度${reverseCount}？\n重复历史不会增加，两端复习记录会合并，设置保持当前值。建议先导出当前备份。`)) return;
    const merged = mergeBackup(snapshot(), incoming, settings.retention);
    try {
      for (const item of merged.words) put('word:' + item.word, item);
      for (const item of merged.history) put('event:' + item.id, item);
      for (const item of merged.book) put('study:' + item.word, item);
      for (const item of merged.recall) put('recall:' + item.word, item);
      notify(); round = null; answer = null; render(); message('合并完成，重复历史已去重');
    } catch { throw new Error('写入中断，部分记录可能已导入；原记录未主动删除，可再次导入继续合并'); }
  }
  function renderSettings() {
    view.append(el('h1', 'heading', '设置与数据'), el('p', 'subheading', '跨网站共用，数据保存在本机油猴存储'));
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
    preferences.append(el('p', 'notice', '外观自动跟随系统深浅色。发音仅在点击后播放。'));
    const study = el('section', 'section');
    study.append(el('h3', '', '复习'));
    const save = (key, value, revert) => {
      try {
        settings = cleanSettings({ ...get('settings', {}), [key]: value });
        put('settings', settings); notify(); round = null; answer = null;
      } catch (error) { revert(); showError(error); }
    };
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
    study.append(limitRow, retentionRow, reverseRow, el('p', 'notice',
      '每天凌晨 4:00 开始新的学习日。记得率越高，间隔越短、复习越多，只影响之后的安排。反向卡在该词进入长期复习后加入，计入新词上限，进度独立保存；关闭后暂停反向卡，进度保留。'));
    const data = el('section', 'section');
    data.append(el('h3', '', '备份与迁移'));
    const actions = el('div', 'actions');
    actions.append(button('导出 JSON 备份', () => download(`lexi-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(snapshot(), null, 2), 'application/json')),
      button('导出历史 CSV', () => exportCsv(false)), button('导出生词 CSV', () => exportCsv(true)));
    const upload = el('input'); upload.type = 'file'; upload.accept = '.json,application/json'; upload.hidden = true;
    upload.addEventListener('change', () => { importFile(upload.files?.[0]).catch(showError); upload.value = ''; });
    actions.append(button('导入 JSON 合并', () => upload.click()));
    data.append(actions, upload, el('p', 'notice', 'JSON 包含完整历史与复习进度，CSV 便于表格查看。导入保留当前设置，按时间合并。'));
    const privacy = el('section', 'section');
    privacy.append(el('h3', '', '服务与隐私'), el('p', 'notice', '查词会向 Free Dictionary API 发送当前单词，并自动向 MyMemory 发送最多 6 条词典释义以补全中文；缺少音标时向有道词典发送当前单词补全。成功后本地保存，再次打开直接读取。网页上下文不会发送。在线音频和浏览器朗读可能联网。服务可用性、内容与额度由提供方决定。'),
      link('Free Dictionary API', 'https://dictionaryapi.dev/'), document.createTextNode(' · '),
      link('MyMemory', 'https://mymemory.translated.net/doc/spec.php'), document.createTextNode(' · '),
      link('有道词典', 'https://www.youdao.com/'));
    const cleanup = el('section', 'section');
    cleanup.append(el('h3', '', '清理数据'));
    const cleanActions = el('div', 'actions');
    cleanActions.append(button('清空查词历史', () => {
      if (!confirm('清空全部查词事件？词条缓存、生词本和复习进度会保留。建议先导出备份。')) return;
      for (const key of GM_listValues().filter(key => key.startsWith(PREFIX + 'event:'))) GM_deleteValue(key);
      selectedEvent = null; notify(); render(); message('查词历史已清空');
    }, 'button danger'), button('删除全部 Lexi 数据', () => {
      if (prompt('此操作不可撤销，请先导出备份。输入“删除全部”以删除全部 Lexi 历史、词条和复习进度：') !== '删除全部') return;
      stopQuery(); stopAudio();
      for (const key of GM_listValues().filter(key => key.startsWith(PREFIX))) GM_deleteValue(key);
      settings = { ...DEFAULTS }; selectedWord = ''; selectedEvent = null; round = null; answer = null;
      notify(); render(); message('Lexi 数据已删除');
    }, 'button danger'));
    cleanup.append(cleanActions);
    view.append(preferences, study, data, privacy, cleanup);
  }

  let selectionTimer;
  let lastSelection = '';
  let lastSelectionAt = 0;
  document.addEventListener('pointerup', event => {
    clearTimeout(selectionTimer);
    if (event.button !== 0 || event.composedPath().includes(host) || !overlay.hidden || !settings.auto) return;
    const target = event.target;
    if (target instanceof Element && target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
    selectionTimer = setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return;
      const anchor = selection.anchorNode?.parentElement;
      if (anchor?.closest('input,textarea,[contenteditable]:not([contenteditable="false"])')) return;
      const raw = selection.toString();
      const word = normalize(raw);
      if (!word || (word === lastSelection && Date.now() - lastSelectionAt < 1200)) return;
      lastSelection = word; lastSelectionAt = Date.now();
      let context = null;
      if (settings.context) {
        const block = anchor?.closest('p,li,td,blockquote,figcaption') || anchor;
        const body = block?.textContent || '';
        const index = body.toLowerCase().indexOf(raw.toLowerCase());
        const url = new URL(location.href); url.search = ''; url.hash = '';
        context = {
          context: body.slice(Math.max(0, index - 90), Math.max(0, index - 90) + 300).replace(/\s+/g, ' '),
          title: text(document.title, 120), sourceUrl: safeUrl(url.href)
        };
      }
      lookup(word, selection.getRangeAt(0).getBoundingClientRect(), context).catch(showError);
    }, 220);
  });
  window.addEventListener('resize', () => { if (!popover.hidden) positionPopover(); });
  document.addEventListener('pointerdown', event => {
    if (!popover.hidden && !event.composedPath().includes(host)) closePopover();
  });
  GM_addValueChangeListener(PREFIX + 'revision', (_name, _old, _next, remote) => {
    if (!remote) return;
    settings = cleanSettings(get('settings', {}));
    if (!overlay.hidden && !studio.contains(shadow.activeElement)) render();
  });
  window.addEventListener('focus', () => {
    settings = cleanSettings(get('settings', {}));
    if (!overlay.hidden) render();
  });
  GM_registerMenuCommand('打开 Lexi 学习中心', () => openStudio());
  GM_registerMenuCommand('暂停 / 开启自动划词', () => {
    settings = cleanSettings({ ...get('settings', {}), auto: !settings.auto });
    put('settings', settings); notify(); message(settings.auto ? '自动划词已开启' : '自动划词已暂停');
  });
})();
