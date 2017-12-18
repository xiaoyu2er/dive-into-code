/* AlloyFinger v0.1.7
 * By dntzhang
 * Github: https://github.com/AlloyTeam/AlloyFinger
 */
;(function () {
    // 获得向量的长度
    function getLen(v) {
        return Math.sqrt(v.x * v.x + v.y * v.y);
    }

    // 两个向量的点积 v1·v2
    function dot(v1, v2) {
        return v1.x * v2.x + v1.y * v2.y;
    }

    // 获得两个向量之间的夹角
    // v1·v2 = |v1|*|v2|*cos<v1,v2>
    // --> cos<v1, v2> = v1·v2 / |v1|*|v2|
    function getAngle(v1, v2) {
        var mr = getLen(v1) * getLen(v2);
        if (mr === 0) return 0;
        var r = dot(v1, v2) / mr;
        if (r > 1) r = 1;
        return Math.acos(r);
    }

    // 两个向量的外积
    // a x b等于由向量a和向量b构成的平行四边形的面积
    // 逆时针大于0 顺时针小于0
    function cross(v1, v2) {
        return v1.x * v2.y - v2.x * v1.y;
    }

    // 获得两个向量的旋转角度
    function getRotateAngle(v1, v2) {
        var angle = getAngle(v1, v2);
        if (cross(v1, v2) > 0) {
            angle *= -1;
        }

        return angle * 180 / Math.PI;
    }

    // 处理手势的 HanlderAdmin
    var HandlerAdmin = function (el) {
        // 监听函数列表
        this.handlers = [];
        // 监听的元素
        this.el = el;
    };

    // 增加一个监听函数
    HandlerAdmin.prototype.add = function (handler) {
        this.handlers.push(handler);
    }

    // 删除(清空)监听函数
    HandlerAdmin.prototype.del = function (handler) {
        if (!handler) this.handlers = [];

        for (var i = this.handlers.length; i >= 0; i--) {
            if (this.handlers[i] === handler) {
                this.handlers.splice(i, 1);
            }
        }
    }

    // 通知监听函数
    HandlerAdmin.prototype.dispatch = function () {
        for (var i = 0, len = this.handlers.length; i < len; i++) {
            var handler = this.handlers[i];
            // 判断监听函数是不是函数 感觉可以放到  HandlerAdmin.prototype.add 中判断
            if (typeof handler === 'function') handler.apply(this.el, arguments);
        }
    }

    // HandlerAdmin 构造工厂
    // 给定一个监听函数 h, 返回一个 HandlerAdmin, 并添加 h 到 HandlerAdmin 的监听列表
    function wrapFunc(el, handler) {
        var handlerAdmin = new HandlerAdmin(el);
        handlerAdmin.add(handler);

        return handlerAdmin;
    }

    var AlloyFinger = function (el, option) {

        // 绑定时间元素
        this.element = typeof el == 'string' ? document.querySelector(el) : el;

        // 将原型上的 start, move, end, cancel 绑定到实例上
        this.start = this.start.bind(this);
        this.move = this.move.bind(this);
        this.end = this.end.bind(this);
        this.cancel = this.cancel.bind(this);

        // 绑定 touchstart, touchmove touchend touchcancel 等原生事件
        this.element.addEventListener("touchstart", this.start, false);
        this.element.addEventListener("touchmove", this.move, false);
        this.element.addEventListener("touchend", this.end, false);
        this.element.addEventListener("touchcancel", this.cancel, false);

        // 两个触摸点的向量
        // 分别是两个触摸点坐标的差值
        // preV.x = p1.x - p0.x
        // preV.y = p1.y - p0.y
        this.preV = {x: null, y: null};

        // ?
        this.pinchStartLen = null;

        // 初始缩放比例
        this.zoom = 1;

        // 是否两次轻点
        this.isDoubleTap = false;

        // 空函数, 作为14种手势默认监听函数
        var noop = function () {
        };

        // 添加14种手势的 HandlerAdmin, 并将用户自定义的 handler 传入, 若没有, 使用空函数
        this.rotate = wrapFunc(this.element, option.rotate || noop);
        this.touchStart = wrapFunc(this.element, option.touchStart || noop);
        this.multipointStart = wrapFunc(this.element, option.multipointStart || noop);
        this.multipointEnd = wrapFunc(this.element, option.multipointEnd || noop);
        this.pinch = wrapFunc(this.element, option.pinch || noop);
        this.swipe = wrapFunc(this.element, option.swipe || noop);
        this.tap = wrapFunc(this.element, option.tap || noop);
        this.doubleTap = wrapFunc(this.element, option.doubleTap || noop);
        this.longTap = wrapFunc(this.element, option.longTap || noop);
        this.singleTap = wrapFunc(this.element, option.singleTap || noop);
        this.pressMove = wrapFunc(this.element, option.pressMove || noop);
        this.touchMove = wrapFunc(this.element, option.touchMove || noop);
        this.touchEnd = wrapFunc(this.element, option.touchEnd || noop);
        this.touchCancel = wrapFunc(this.element, option.touchCancel || noop);

        // 两次触摸的时间间隔
        this.delta = null;
        // 上次触摸的时间戳
        this.last = null;
        // 当次触摸的时间戳
        this.now = null;
        this.tapTimeout = null;
        this.singleTapTimeout = null;
        this.longTapTimeout = null;
        this.swipeTimeout = null;
        this.x1 = this.x2 = this.y1 = this.y2 = null;
        // 上次触摸位置
        this.preTapPosition = {x: null, y: null};
    };

    AlloyFinger.prototype = {
        // 原生 touchstart 处理器
        start: function (evt) {
            // 没有碰触事件 则返回
            if (!evt.touches) return;
            // 当前时间的时间戳
            this.now = Date.now();
            // 第一个手指的 x1, y1
            this.x1 = evt.touches[0].pageX;
            this.y1 = evt.touches[0].pageY;
            // 与上次触摸的间隔
            this.delta = this.now - (this.last || this.now);
            // 触发 touchStart 事件
            this.touchStart.dispatch(evt);

            // 若存在上次触摸
            if (this.preTapPosition.x !== null) {
                // 判断两次触摸
                // 0<间隔<250ms, 0<x间距>30, 0<y间距<30
                // 即是双击
                this.isDoubleTap = (this.delta > 0 && this.delta <= 250 && Math.abs(this.preTapPosition.x - this.x1) < 30 && Math.abs(this.preTapPosition.y - this.y1) < 30);
            }
            // 更新上次触摸
            this.preTapPosition.x = this.x1;
            this.preTapPosition.y = this.y1;
            this.last = this.now;

            var preV = this.preV,
                // 触摸点的个数
                len = evt.touches.length;
            if (len > 1) {
                // 若存在多个触摸点, 则不可能触发长按和单按, 取消之
                this._cancelLongTap();
                this._cancelSingleTap();
                // v 是代表两个触摸点的向量
                // v.x = p1.x - p0.x;
                // v.y = p1.y - p0.y;
                var v = {x: evt.touches[1].pageX - this.x1, y: evt.touches[1].pageY - this.y1};
                preV.x = v.x;
                preV.y = v.y;
                //  pinchStart 的长度
                this.pinchStartLen = getLen(preV);
                // 触发 多点触摸 事件
                this.multipointStart.dispatch(evt);
            }
            // 添加 longTap 定时器
            this.longTapTimeout = setTimeout(function () {
                // 750ms 后出发 longTap 事件
                this.longTap.dispatch(evt);
            }.bind(this), 750);
        },
        // 原生 touchmove 处理器
        move: function (evt) {
            // 若没有触摸点, 返回
            if (!evt.touches) return;
            // 上次多点触摸的向量
            var preV = this.preV,
                // 触摸点的长度
                len = evt.touches.length,
                // move 的第一个触摸的位置 x, y
                currentX = evt.touches[0].pageX,
                currentY = evt.touches[0].pageY;
            // 双击状态置否
            this.isDoubleTap = false;

            // 若有多个触发点
            if (len > 1) {
                // 代表当前两触摸到的向量
                var v = {x: evt.touches[1].pageX - currentX, y: evt.touches[1].pageY - currentY};

                // 如果存在上一个触摸点的向量
                // 判断
                if (preV.x !== null) {
                    // 如果
                    if (this.pinchStartLen > 0) {
                        // 判断缩放比例
                        evt.zoom = getLen(v) / this.pinchStartLen;
                        // 触发 pinch 事件
                        this.pinch.dispatch(evt);
                    }
                    // 判断旋转角度
                    // 这里有一个疑问, 为什么 pinch 是相对第一次触摸的变化, 而缩放是相对于上一次触摸的变化
                    evt.angle = getRotateAngle(v, preV);
                    // 触发 旋转 事件
                    this.rotate.dispatch(evt);
                }
                // 更新
                preV.x = v.x;
                preV.y = v.y;
            } else {
                // 如果没有多点触摸, 那么触发 pressMove
                // 且添加 pressMove 的间距 deltaX, deltaY
                if (this.x2 !== null) {
                    evt.deltaX = currentX - this.x2;
                    evt.deltaY = currentY - this.y2;

                } else {
                    evt.deltaX = 0;
                    evt.deltaY = 0;
                }
                this.pressMove.dispatch(evt);
            }
            // 触发 touchMove 事件
            this.touchMove.dispatch(evt);

            // 取消长按
            this._cancelLongTap();
            // 更新第二个手指的坐标
            this.x2 = currentX;
            this.y2 = currentY;
            // 出现多个触摸点的时候, 禁止默认的事件
            if (len > 1) {
                evt.preventDefault();
            }
        },
        // 原生 touchend 处理器
        end: function (evt) {
            // 如果没有触摸点返回
            if (!evt.changedTouches) return;
            // 取消长按
            this._cancelLongTap();
            var self = this;
            // 如果触摸点数量小于2, 触发 multipointEnd 事件
            if (evt.touches.length < 2) {
                this.multipointEnd.dispatch(evt);
            }

            // 如果第一个触摸点和最后一个触摸点 x, y 的间距都大于30, 那么触发 swipe
            if ((this.x2 && Math.abs(this.x1 - this.x2) > 30) ||
                (this.y2 && Math.abs(this.y1 - this.y2) > 30)) {
                // 获得 swipe 方向
                evt.direction = this._swipeDirection(this.x1, this.x2, this.y1, this.y2);
                this.swipeTimeout = setTimeout(function () {
                    self.swipe.dispatch(evt);
                }, 0)
            } else {
                // 否则
                this.tapTimeout = setTimeout(function () {
                    // 触发 tap 事件
                    self.tap.dispatch(evt);
                    // trigger double tap immediately
                    if (self.isDoubleTap) {
                        self.doubleTap.dispatch(evt);
                        clearTimeout(self.singleTapTimeout);
                        self.isDoubleTap = false;
                    }
                }, 0)

                if (!self.isDoubleTap) {
                    self.singleTapTimeout = setTimeout(function () {
                        self.singleTap.dispatch(evt);
                    }, 250);
                }
            }

            // 触发 touchEnd 事件
            this.touchEnd.dispatch(evt);

            // 重置变量
            this.preV.x = 0;
            this.preV.y = 0;
            this.zoom = 1;
            this.pinchStartLen = null;
            this.x1 = this.x2 = this.y1 = this.y2 = null;
        },
        // 原生 touchcancel 的事件处理器
        cancel: function (evt) {
            // 取消定时器
            clearTimeout(this.singleTapTimeout);
            clearTimeout(this.tapTimeout);
            clearTimeout(this.longTapTimeout);
            clearTimeout(this.swipeTimeout);
            // 触发 touchCancel 事件
            this.touchCancel.dispatch(evt);
        },
        // 清除 longTap 定时器
        _cancelLongTap: function () {
            clearTimeout(this.longTapTimeout);
        },
        // 清除 singleTap 定时器
        _cancelSingleTap: function () {
            clearTimeout(this.singleTapTimeout);
        },
        // 获得滑动的方向
        _swipeDirection: function (x1, x2, y1, y2) {
            return Math.abs(x1 - x2) >= Math.abs(y1 - y2) ? (x1 - x2 > 0 ? 'Left' : 'Right') : (y1 - y2 > 0 ? 'Up' : 'Down')
        },

        // 添加14个事件的监听函数
        on: function (evt, handler) {
            if (this[evt]) {
                this[evt].add(handler);
            }
        },

        // 删除14个事件的监听函数
        off: function (evt, handler) {
            if (this[evt]) {
                this[evt].del(handler);
            }
        },

        // 析构, 防止内存泄露
        destroy: function () {
            if (this.singleTapTimeout) clearTimeout(this.singleTapTimeout);
            if (this.tapTimeout) clearTimeout(this.tapTimeout);
            if (this.longTapTimeout) clearTimeout(this.longTapTimeout);
            if (this.swipeTimeout) clearTimeout(this.swipeTimeout);

            // 移除原生 touchstart, touchmove, touchend, touchcancel 的事件处理器
            this.element.removeEventListener("touchstart", this.start);
            this.element.removeEventListener("touchmove", this.move);
            this.element.removeEventListener("touchend", this.end);
            this.element.removeEventListener("touchcancel", this.cancel);

            // 删除所有事件的监听函数
            this.rotate.del();
            this.touchStart.del();
            this.multipointStart.del();
            this.multipointEnd.del();
            this.pinch.del();
            this.swipe.del();
            this.tap.del();
            this.doubleTap.del();
            this.longTap.del();
            this.singleTap.del();
            this.pressMove.del();
            this.touchMove.del();
            this.touchEnd.del();
            this.touchCancel.del();

            // 变量置空
            this.preV = this.pinchStartLen = this.zoom = this.isDoubleTap = this.delta = this.last =
                this.now = this.tapTimeout = this.singleTapTimeout = this.longTapTimeout = this.swipeTimeout =
                    this.x1 = this.x2 = this.y1 = this.y2 = this.preTapPosition = this.rotate = this.touchStart =
                        this.multipointStart = this.multipointEnd = this.pinch = this.swipe = this.tap = this.doubleTap =
                            this.longTap = this.singleTap = this.pressMove = this.touchMove = this.touchEnd = this.touchCancel = null;

            return null;
        }
    };

    if (typeof module !== 'undefined' && typeof exports === 'object') {
        module.exports = AlloyFinger;
    } else {
        window.AlloyFinger = AlloyFinger;
    }
})();
