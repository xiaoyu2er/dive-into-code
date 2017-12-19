!(function (win) {

    /**
     * FastDom
     *
     * Eliminates layout thrashing by batching DOM read/write interactions.
     * 通过批量读写 DOM 来减少布局抖动
     *
     * @author Wilson Page <wilsonpage@me.com>
     * @author Kornel Lesinski <kornel.lesinski@ft.com>
     * @notes xiaoyu2er <https://github.com/xiaoyu2er>
     */

    'use strict';

    /**
     * Mini logger
     * 开发模式下的 console.log 添加 fastdom 前缀
     *
     * @return {Function}
     */
    var debug = 0 ? console.log.bind(console, '[fastdom]') : function () {
    };

    /**
     * Normalized rAF
     * 标准化 requestAnimationFrame
     *
     * @type {Function}
     */
    var raf = win.requestAnimationFrame
        || win.webkitRequestAnimationFrame
        || win.mozRequestAnimationFrame
        || win.msRequestAnimationFrame
        || function (cb) {
            return setTimeout(cb, 16);
        };

    /**
     * Initialize a `FastDom`.
     * FastDom 的构造函数
     *
     * @constructor
     */
    function FastDom() {
        var self = this;
        // 读操作
        self.reads = [];
        // 写操作
        self.writes = [];
        // 挂载 requestAnimationFrame 到 fastDom 实例上
        self.raf = raf.bind(win); // test hook
        debug('initialized', self);
    }

    // FastDom's prototype 上的方法
    FastDom.prototype = {
        constructor: FastDom,

        /**
         * Adds a job to the read batch and
         * schedules a new frame if need be.
         * 为批量读添加任务, 如果需要的话, 安排新的一帧执行
         *
         * @param  {Function} fn
         * @param  {Object} ctx the context to be bound to `fn` (optional).
         * @public
         */
        measure: function (fn, ctx) {
            debug('measure');
            // 为 fn 绑定 上下文 --> task
            var task = !ctx ? fn : fn.bind(ctx);
            // 将 task 加入 reads 数组
            this.reads.push(task);

            scheduleFlush(this);
            return task;
        },

        /**
         * Adds a job to the
         * write batch and schedules
         * a new frame if need be.
         * 为批量写添加任务, 如果需要的话, 安排新的一帧执行
         *
         * @param  {Function} fn
         * @param  {Object} ctx the context to be bound to `fn` (optional).
         * @public
         */
        mutate: function (fn, ctx) {
            debug('mutate');
            var task = !ctx ? fn : fn.bind(ctx);
            this.writes.push(task);
            scheduleFlush(this);
            return task;
        },

        /**
         * Clears a scheduled 'read' or 'write' task.
         * 移出一个读或写任务
         *
         * @param {Object} task
         * @return {Boolean} success
         * @public
         */
        clear: function (task) {
            debug('clear', task);
            return remove(this.reads, task) || remove(this.writes, task);
        },

        /**
         * Extend this FastDom with some
         * custom functionality.
         * 使用自定义功能 扩充 FastDom
         *
         * Because fastdom must *always* be a
         * singleton, we're actually extending
         * the fastdom instance. This means tasks
         * scheduled by an extension still enter
         * fastdom's global task queue.
         *
         * 由于 fastdom 总是一个单例, 所以我们需要在 唯一一个 fastdom 的实例上扩充
         * 这就意味着通过扩展添加的任务仍然进入到了 fastdom 的全局任务队列中
         *
         * The 'super' instance can be accessed
         * from `this.fastdom`.
         *
         * 父实例可以通过 this.fastdom 来获取
         *
         * @example
         *
         * var myFastdom = fastdom.extend({
   *   initialize: function() {
   *     // runs on creation
   *   },
   *
   *   // override a method
   *   measure: function(fn) {
   *     // do extra stuff ...
   *
   *     // then call the original
   *     return this.fastdom.measure(fn);
   *   },
   *
   *   ...
   * });
         *
         *
         * @param  {Object} props  properties to mixin
         * @return {FastDom}
         */
        extend: function (props) {
            debug('extend', props);
            if (typeof props != 'object') throw new Error('expected object');

            // Object.create() 方法会使用指定的原型对象及其属性去创建一个新的对象。
            // @see https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Object/create
            var child = Object.create(this);
            // mixin(target, source);
            // 将 props 上的属性赋给 child (fastdom 的一个)
            mixin(child, props);
            // 在 child中, 可通过 this.fastdom 来获取 this
            child.fastdom = this;

            // run optional creation hook
            // 调用 child 的 init 方法
            if (child.initialize) child.initialize();

            return child;
        },

        // override this with a function
        // to prevent Errors in console
        // when tasks throw
        catch: null
    };

    /**
     * Schedules a new read/write
     * batch if one isn't pending.
     *
     * 如果没有即将开展的
     *
     * @private
     */
    function scheduleFlush(fastdom) {
        // 判断是否安排了下次批量执行
        if (!fastdom.scheduled) {
            // 安排下次批量执行
            fastdom.scheduled = true;
            // 等到下次动画帧的时候执行
            fastdom.raf(flush.bind(null, fastdom));
            debug('flush scheduled');
        }
    }

    /**
     * Runs queued `read` and `write` tasks.
     * 批量执行读写任务(先进先出)
     *
     * Errors are caught and thrown by default.
     * If a `.catch` function has been defined
     * it is called instead.
     *
     * 如果捕捉到 error, 如果有.catch 方法, 那么执行 .catch 方法, 否则抛出
     *
     * @private
     */
    function flush(fastdom) {
        debug('flush');

        var writes = fastdom.writes;
        var reads = fastdom.reads;
        var error;

        // 批量执行读写操作
        try {
            debug('flushing reads', reads.length);
            runTasks(reads);
            debug('flushing writes', writes.length);
            runTasks(writes);
        } catch (e) { error = e; }

        // 本次批量执行结束, 可安排下一次
        fastdom.scheduled = false;

        // If the batch errored we may still have tasks queued
        // 即使批量操作有异常, 我们仍然维持了队列, 重新调用
        if (reads.length || writes.length) scheduleFlush(fastdom);

        // 如果出现异常, 判断 fastdom 有没有 .catch 方法, 如果有那么执行, 否则抛出
        if (error) {
            debug('task errored', error.message);
            if (fastdom.catch) fastdom.catch(error);
            else throw error;
        }
    }

    /**
     *
     * We run this inside a try catch
     * so that if any jobs error, we
     * are able to recover and continue
     * to flush the batch until it's empty.
     *
     * runTasks 方法在 try...catch 块中执行,
     * 如果某一个任务抛出异常, 那么我们可以恢复并且继续执行, 直到队列为空
     *
     * @private
     */
    function runTasks(tasks) {
        debug('run tasks');
        var task;
        while (task = tasks.shift()) task();
    }

    /**
     * Remove an item from an Array.
     *
     * 从列表中移除一项
     *
     * @param  {Array} array
     * @param  {*} item
     * @return {Boolean}
     */
    function remove(array, item) {
        var index = array.indexOf(item);
        // ~ 为按位取反, -1 按位取反得到0
        // !! 取 boolean 值
        return !!~index && !!array.splice(index, 1);
    }

    /**
     * Mixin own properties of source
     * object into the target.
     *
     * 将 source 中的自由属性 赋给 target
     *
     * @param  {Object} target
     * @param  {Object} source
     */
    function mixin(target, source) {
        for (var key in source) {
            if (source.hasOwnProperty(key)) target[key] = source[key];
        }
    }

// There should never be more than
// one instance of `FastDom` in an app
    // 单例模式, 全局仅存在一个 FastDom 实例 fastdom
    var exports = win.fastdom = (win.fastdom || new FastDom()); // jshint ignore:line

// Expose to CJS & AMD
    if ((typeof define) == 'function') define(function () {
        return exports;
    });
    else if ((typeof module) == 'object') module.exports = exports;

})(typeof window !== 'undefined' ? window : this);