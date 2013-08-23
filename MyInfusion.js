/*!
 * Fluid Infusion v1.5
 *
 * Infusion is distributed under the Educational Community License 2.0 and new BSD licenses: 
 * http://wiki.fluidproject.org/display/fluid/Fluid+Licensing
 *
 * For information on copyright, see the individual Infusion source code files: 
 * https://github.com/fluid-project/infusion/
 */
/*
Copyright 2007-2010 University of Cambridge
Copyright 2007-2009 University of Toronto
Copyright 2007-2009 University of California, Berkeley
Copyright 2010-2011 Lucendo Development Ltd.
Copyright 2010 OCAD University
Copyright 2011 Charly Molter

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global console, window, fluid:true, fluid_1_5:true, jQuery, opera, YAHOO*/

// JSLint options 
/*jslint white: true, trailing: true, funcinvoke: true, continue: true, jslintok: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 1000, indent: 4 */

var fluid_1_5 = fluid_1_5 || {};
var fluid = fluid || fluid_1_5;

(function ($, fluid) {
    
    fluid.version = "Infusion 1.5";
    
    // Export this for use in environments like node.js, where it is useful for
    // configuring stack trace behaviour
    fluid.Error = Error;
    
    fluid.environment = {
        fluid: fluid
    };
    
    var globalObject = window || {};
    
    fluid.activityTracing = false;
    fluid.activityTrace = [];

    var activityParser = /(%\w+)/g;

    // Renders a single activity element in a form suitable to be sent to a modern browser's console
    // unsupported, non-API function
    fluid.renderOneActivity = function (activity, nowhile) {
        var togo = nowhile === true ? [] : ["    while "];
        var message = activity.message;
        var index = activityParser.lastIndex = 0;
        while (true) {
            var match = activityParser.exec(message);
            if (match) {
                var key = match[1].substring(1);
                togo.push(message.substring(index, match.index));
                togo.push(activity.args[key]);
                index = activityParser.lastIndex;
            }
            else {
                break;
            }
        }
        if (index < message.length) {
            togo.push(message.substring(index));
        }
        return togo;
    };
    
    // Renders an activity stack in a form suitable to be sent to a modern browser's console
    // unsupported, non-API function
    fluid.renderActivity = function (activityStack, renderer) {
        renderer = renderer || fluid.renderOneActivity;
        return fluid.transform(activityStack, renderer);
    };

    // Return an array of objects describing the current activity
    // unsupported, non-API function    
    fluid.getActivityStack = function () {
        var root = fluid.globalThreadLocal();
        if (!root.activityStack) {
            root.activityStack = [];
        }
        return root.activityStack;
    };

    // Return an array of objects describing the current activity
    // unsupported, non-API function
    fluid.describeActivity = fluid.getActivityStack;
    
    // Renders either the current activity or the supplied activity to the console
    fluid.logActivity = function (activity) {
        activity = activity || fluid.describeActivity();
        var rendered = fluid.renderActivity(activity).reverse();
        fluid.log("Current activity: ");
        fluid.each(rendered, function (args) {
            fluid.doLog(args);
        });
    };
    
    // Execute the supplied function with the specified activity description pushed onto the stack
    // unsupported, non-API function
    fluid.pushActivity = function (type, message, args) {
        var record = {type: type, message: message, args: args, time: new Date().getTime()};
        if (fluid.activityTracing) {
            fluid.activityTrace.push(record);
        }
        if (fluid.passLogLevel(fluid.logLevel.TRACE)) {
            fluid.doLog(fluid.renderOneActivity(record, true));  
        }
        var activityStack = fluid.getActivityStack();
        activityStack.push(record);
    };
    
    // Undo the effect of the most recent pushActivity, or multiple frames if an argument is supplied
    fluid.popActivity = function (popframes) {
        popframes = popframes || 1;
        if (fluid.activityTracing) {
            fluid.activityTrace.push({pop: popframes});
        }
        var activityStack = fluid.getActivityStack();
        var popped = activityStack.length - popframes;
        activityStack.length = popped < 0 ? 0 : popped;
    };
    // "this-ist" style Error so that we can distinguish framework errors whilst still retaining access to platform Error features
    // unsupported, non-API function
    fluid.FluidError = function (message) {
        this.message = message;
        this.stack = new Error().stack;
    };
    fluid.FluidError.prototype = new Error();
    
    // The framework's built-in "fail" policy, in case a user-defined handler would like to
    // defer to it
    fluid.builtinFail = function (soft, args, activity) {
        fluid.log.apply(null, [fluid.logLevel.FAIL, "ASSERTION FAILED: "].concat(args));
        fluid.logActivity(activity);
        var message = args.join("");
        if (soft) {
            throw new fluid.FluidError(message);
        } else {
            message["Assertion failure - check console for details"](); // Intentionally cause a browser error by invoking a nonexistent function.
        }
    };
    
    var softFailure = [false];
    
    /**
     * Signals an error to the framework. The default behaviour is to log a structured error message and throw a variety of
     * exception (hard or soft) - see fluid.pushSoftFailure for configuration
     *
     * @param {String} message the error message to log
     * @param ... Additional arguments, suitable for being sent to native console.log function
     */
    fluid.fail = function (message /*, ... */) { // jslint:ok - whitespace in arg list
        var args = fluid.makeArray(arguments);
        var activity = fluid.makeArray(fluid.describeActivity()); // Take copy since we will destructively modify
        fluid.popActivity(activity.length);
        var topFailure = softFailure[0];
        if (typeof(topFailure) === "boolean") {
            fluid.builtinFail(topFailure, args, activity);
        } else if (typeof(topFailure) === "function") {
            topFailure(args, activity);
        }
    };
    
    /** 
     * Configure the behaviour of fluid.fail by pushing or popping a disposition record onto a stack.
     * @param {Boolean|Number|Function} condition
     & Supply either a boolean flag choosing between built-in framework strategies to be used in fluid.fail 
     * - <code>false</code>, the default causes a "hard failure" by using a nonexistent property on a String, which
     * will in all known environments trigger an unhandleable exception which aids debugging. The boolean value
     * <code>true</code> downgrades this behaviour to throw a conventional exception, which is more appropriate in
     * test cases which need to demonstrate failure, as well as in some production environments.
     * The argument may also be a function, which will be called with two arguments, args (the complete arguments to
     * fluid.fail) and activity, an array of strings describing the current framework invocation state.
     * Finally, the argument may be the number <code>-1</code> indicating that the previously supplied disposition should
     * be popped off the stack
     */
    fluid.pushSoftFailure = function (condition) {
        if (typeof (condition) === "boolean" || typeof (condition) === "function") {
            softFailure.unshift(condition);
        } else if (condition === -1) {
            softFailure.shift();
        }
    };
    
    fluid.notrycatch = true;
    
    // A wrapper for the try/catch/finally language feature, to aid debugging on environments
    // such as IE, where any try will destroy stack information for errors
    // TODO: The only non-deprecated call to this annoying utility is left in DataBinding.js to deal with
    // cleanup in source tracking. We should really review whether we mean to abolish all exception handling
    // code throughout the framework - on several considerations this is desirable.
    fluid.tryCatch = function (tryfun, catchfun, finallyfun) {
        finallyfun = finallyfun || fluid.identity;
        if (fluid.notrycatch) {
            var togo = tryfun();
            finallyfun();
            return togo;
        } else {
            try {
                return tryfun();
            } catch (e) {
                if (catchfun) {
                    catchfun(e);
                } else {
                    throw (e);
                }
            } finally {
                finallyfun();
            }
        }
    };
    
    // TODO: rescued from kettleCouchDB.js - clean up in time
    fluid.expect = function (name, members, target) {
        fluid.transform(fluid.makeArray(members), function (key) {
            if (typeof target[key] === "undefined") {
                fluid.fail(name + " missing required parameter " + key);
            }
        });
    };

    // Logging
    
    /** Returns whether logging is enabled **/
    fluid.isLogging = function () {
        return logLevelStack[0].priority > fluid.logLevel.IMPORTANT.priority;
    };
    
    /** Determines whether the supplied argument is a valid logLevel marker **/
    fluid.isLogLevel = function (arg) {
        return fluid.isMarker(arg) && arg.priority !== undefined;
    };
    
    /** Accepts one of the members of the <code>fluid.logLevel</code> structure. Returns <code>true</code> if
     *  a message supplied at that log priority would be accepted at the current logging level. Clients who
     *  issue particularly expensive log payload arguments are recommended to guard their logging statements with this
     *  function */
     
    fluid.passLogLevel = function (testLogLevel) {
        return testLogLevel.priority <= logLevelStack[0].priority;
    };

    /** Method to allow user to control the logging level. Accepts either a boolean, for which <code>true</code>
      * represents <code>fluid.logLevel.INFO</code> and <code>false</code> represents <code>fluid.logLevel.IMPORTANT</code> (the default), 
      * or else any other member of the structure <code>fluid.logLevel</code>
      * Messages whose priority is strictly less than the current logging level will not be shown*/
    fluid.setLogging = function (enabled) {
        var logLevel;
        if (typeof enabled === "boolean") {
            logLevel = fluid.logLevel[enabled? "INFO" : "IMPORTANT"];
        } else if (fluid.isLogLevel(enabled)) {
            logLevel = enabled;
        } else {
            fluid.fail("Unrecognised fluid logging level ", enabled);
        }
        logLevelStack.unshift(logLevel);
    };
    
    fluid.setLogLevel = fluid.setLogging;
    
    /** Undo the effect of the most recent "setLogging", returning the logging system to its previous state **/
    fluid.popLogging = function () {
        return logLevelStack.length === 1? logLevelStack[0] : logLevelStack.shift();
    };
    
    /** Actually do the work of logging <code>args</code> to the environment's console. If the standard "console"
     * stream is available, the message will be sent there - otherwise either the
     * YAHOO logger or the Opera "postError" stream will be used. On capable environments (those other than
     * IE8 or IE9) the entire argument set will be dispatched to the logger - otherwise they will be flattened into
     * a string first, destroying any information held in non-primitive values. 
     */ 
    fluid.doLog = function (args) {
        var str = args.join("");
        if (typeof (console) !== "undefined") {
            if (console.debug) {
                console.debug.apply(console, args);
            } else if (typeof (console.log) === "function") {
                console.log.apply(console, args);
            } else {
                console.log(str); // this branch executes on old IE, fully synthetic console.log
            }
        } else if (typeof (YAHOO) !== "undefined") {
            YAHOO.log(str);
        } else if (typeof (opera) !== "undefined") {
            opera.postError(str);
        }      
    };

    /** Log a message to a suitable environmental console. If the first argument to fluid.log is
     * one of the members of the <code>fluid.logLevel</code> structure, this will be taken as the priority 
     * of the logged message - else if will default to <code>fluid.logLevel.INFO</code>. If the logged message
     * priority does not exceed that set by the most recent call to the <code>fluid.setLogging</code> function,
     * the message will not appear.
     */
    fluid.log = function (message /*, ... */) { // jslint:ok - whitespace in arg list
        var directArgs = fluid.makeArray(arguments);
        var userLogLevel = fluid.logLevel.INFO;
        if (fluid.isLogLevel(directArgs[0])) {
            userLogLevel = directArgs.shift();
        }
        if (fluid.passLogLevel(userLogLevel)) {
            var arg0 = fluid.renderTimestamp(new Date()) + ":  ";
            var args = [arg0].concat(directArgs);
            fluid.doLog(args);
        }
    };
     
    // Functional programming utilities.
               
    /** A basic utility that returns its argument unchanged */
    
    fluid.identity = function (arg) {
        return arg;
    };
    
    // Framework and instantiation functions.

    
    /** Returns true if the argument is a value other than null or undefined **/
    fluid.isValue = function (value) {
        return value !== undefined && value !== null;
    };
    
    /** Returns true if the argument is a primitive type **/
    fluid.isPrimitive = function (value) {
        var valueType = typeof (value);
        return !value || valueType === "string" || valueType === "boolean" || valueType === "number" || valueType === "function";
    };
    
    /** Determines whether the supplied object is an array. The strategy used is an optimised
     * approach taken from an earlier version of jQuery - detecting whether the toString() version
     * of the object agrees with the textual form [object Array], or else whether the object is a
     * jQuery object (the most common source of "fake arrays").
     */
    fluid.isArrayable = function (totest) {
        return totest && (totest.jquery || Object.prototype.toString.call(totest) === "[object Array]");
    };
    
    fluid.isDOMNode = function (obj) {
      // This could be more sound, but messy:
      // http://stackoverflow.com/questions/384286/javascript-isdom-how-do-you-check-if-a-javascript-object-is-a-dom-object
        return obj && typeof (obj.nodeType) === "number";
    };
    
    fluid.isDOMish = function (obj) {
        return fluid.isDOMNode(obj) || obj.jquery;
    };
    
    /** Return an empty container as the same type as the argument (either an
     * array or hash */
    fluid.freshContainer = function (tocopy) {
        return fluid.isArrayable(tocopy) ? [] : {};
    };
    
    /** Performs a deep copy (clone) of its argument **/
    
    fluid.copy = function (tocopy) {
        if (fluid.isPrimitive(tocopy)) {
            return tocopy;
        }
        return $.extend(true, fluid.freshContainer(tocopy), tocopy);
    };
            
    /** Corrected version of jQuery makeArray that returns an empty array on undefined rather than crashing.
      * We don't deal with as many pathological cases as jQuery **/
    fluid.makeArray = function (arg) {
        var togo = [];
        if (arg !== null && arg !== undefined) {
            if (fluid.isPrimitive(arg) || typeof(arg.length) !== "number") {
                togo.push(arg);
            }
            else {
                for (var i = 0; i < arg.length; ++ i) {
                    togo[i] = arg[i];
                }
            }
        }
        return togo;
    };
    
    function transformInternal(source, togo, key, args) {
        var transit = source[key];
        for (var j = 0; j < args.length - 1; ++j) {
            transit = args[j + 1](transit, key);
        }
        togo[key] = transit;
    }
    
    /** Return a list or hash of objects, transformed by one or more functions. Similar to
     * jQuery.map, only will accept an arbitrary list of transformation functions and also
     * works on non-arrays.
     * @param source {Array or Object} The initial container of objects to be transformed.
     * @param fn1, fn2, etc. {Function} An arbitrary number of optional further arguments,
     * all of type Function, accepting the signature (object, index), where object is the
     * list member to be transformed, and index is its list index. Each function will be
     * applied in turn to each list member, which will be replaced by the return value
     * from the function.
     * @return The finally transformed list, where each member has been replaced by the
     * original member acted on by the function or functions.
     */
    fluid.transform = function (source) {
        var togo = fluid.freshContainer(source);
        if (fluid.isArrayable(source)) {
            for (var i = 0; i < source.length; ++i) {
                transformInternal(source, togo, i, arguments);
            }
        } else {
            for (var key in source) {
                transformInternal(source, togo, key, arguments);
            }
        }
        return togo;
    };
    
    /** Better jQuery.each which works on hashes as well as having the arguments
     * the right way round.
     * @param source {Arrayable or Object} The container to be iterated over
     * @param func {Function} A function accepting (value, key) for each iterated
     * object. This function may return a value to terminate the iteration
     */
    fluid.each = function (source, func) {
        if (fluid.isArrayable(source)) {
            for (var i = 0; i < source.length; ++i) {
                func(source[i], i);
            }
        } else {
            for (var key in source) {
                func(source[key], key);
            }
        }
    };
    
    fluid.make_find = function (find_if) {
        var target = find_if ? false : undefined;
        return function (source, func, deffolt) {
            var disp;
            if (fluid.isArrayable(source)) {
                for (var i = 0; i < source.length; ++i) {
                    disp = func(source[i], i);
                    if (disp !== target) {
                        return find_if ? source[i] : disp;
                    }
                }
            } else {
                for (var key in source) {
                    disp = func(source[key], key);
                    if (disp !== target) {
                        return find_if ? source[key] : disp;
                    }
                }
            }
            return deffolt;
        };
    };
    
    /** Scan through a list or hash of objects, terminating on the first member which
     * matches a predicate function.
     * @param source {Arrayable or Object} The list or hash of objects to be searched.
     * @param func {Function} A predicate function, acting on a member. A predicate which
     * returns any value which is not <code>undefined</code> will terminate
     * the search. The function accepts (object, index).
     * @param deflt {Object} A value to be returned in the case no predicate function matches
     * a list member. The default will be the natural value of <code>undefined</code>
     * @return The first return value from the predicate function which is not <code>undefined</code>
     */
    fluid.find = fluid.make_find(false);
    /** The same signature as fluid.find, only the return value is the actual element for which the
     * predicate returns a value different from <code>false</code> 
     */
    fluid.find_if = fluid.make_find(true);
    
    /** Scan through a list of objects, "accumulating" a value over them
     * (may be a straightforward "sum" or some other chained computation). "accumulate" is the name derived
     * from the C++ STL, other names for this algorithm are "reduce" or "fold".
     * @param list {Array} The list of objects to be accumulated over.
     * @param fn {Function} An "accumulation function" accepting the signature (object, total, index) where
     * object is the list member, total is the "running total" object (which is the return value from the previous function),
     * and index is the index number.
     * @param arg {Object} The initial value for the "running total" object.
     * @return {Object} the final running total object as returned from the final invocation of the function on the last list member.
     */
    fluid.accumulate = function (list, fn, arg) {
        for (var i = 0; i < list.length; ++i) {
            arg = fn(list[i], arg, i);
        }
        return arg;
    };
    
    /** Scan through a list or hash of objects, removing those which match a predicate. Similar to
     * jQuery.grep, only acts on the list in-place by removal, rather than by creating
     * a new list by inclusion.
     * @param source {Array|Object} The list or hash of objects to be scanned over.
     * @param fn {Function} A predicate function determining whether an element should be
     * removed. This accepts the standard signature (object, index) and returns a "truthy"
     * result in order to determine that the supplied object should be removed from the list.
     * @param target {Array|Object} (optional) A target object of the same type as <code>source</code>, which will
     * receive any objects removed from it.
     * @return <code>target</code>, containing the removed elements, if it was supplied, or else <code>source</code>
     * modified by the operation of removing the matched elements.
     */
    fluid.remove_if = function (source, fn, target) {
        if (fluid.isArrayable(source)) {
            for (var i = 0; i < source.length; ++i) {
                if (fn(source[i], i)) {
                    if (target) {
                        target.push(source[i]);
                    }
                    source.splice(i, 1);
                    --i;
                }
            }
        } else {
            for (var key in source) {
                if (fn(source[key], key)) {
                    if (target) {
                        target[key] = source[key];
                    }
                    delete source[key];
                }
            }
        }
        return target || source;
    };
    
    /** Fills an array of given size with copies of a value or result of a function invocation
     * @param n {Number} The size of the array to be filled
     * @param generator {Object|Function} Either a value to be replicated or function to be called 
     * @param applyFunc {Boolean} If true, treat the generator value as a function to be invoked with
     * argument equal to the index position
     */
      
    fluid.generate = function (n, generator, applyFunc) {
        var togo = [];
        for (var i = 0; i < n; ++ i) {
            togo[i] = applyFunc? generator(i) : generator;
        }
        return togo;
    };
    
    /** Accepts an object to be filtered, and a list of keys. Either all keys not present in
     * the list are removed, or only keys present in the list are returned.
     * @param toFilter {Array|Object} The object to be filtered - this will be modified by the operation
     * @param keys {Array of String} The list of keys to operate with
     * @param exclude {boolean} If <code>true</code>, the keys listed are removed rather than included
     * @return the filtered object (the same object that was supplied as <code>toFilter</code>
     */
    
    fluid.filterKeys = function (toFilter, keys, exclude) {
        return fluid.remove_if($.extend({}, toFilter), function (value, key) {
            return exclude ^ ($.inArray(key, keys) === -1);
        });
    };
    
    /** A convenience wrapper for <code>fluid.filterKeys</code> with the parameter <code>exclude</code> set to <code>true</code>
     *  Returns the supplied object with listed keys removed */

    fluid.censorKeys = function (toCensor, keys) {
        return fluid.filterKeys(toCensor, keys, true);
    };
    
    fluid.makeFlatten = function (index) {
        return function (obj) {
            var togo = [];
            fluid.each(obj, function (/* value, key */) {
                togo.push(arguments[index]);
            });
            return togo;
        };
    };
    
    /** Return the keys in the supplied object as an array **/
    fluid.keys = fluid.makeFlatten(1);
    
    /** Return the values in the supplied object as an array **/
    fluid.values = fluid.makeFlatten(0);
    
    /**
     * Searches through the supplied object, and returns <code>true</code> if the supplied value
     * can be found
     */
    fluid.contains = function (obj, value) {
        return obj ? fluid.find(obj, function (thisValue) {
            if (value === thisValue) {
                return true;
            }
        }) : undefined;
    };
    
    /**
     * Searches through the supplied object for the first value which matches the one supplied.
     * @param obj {Object} the Object to be searched through
     * @param value {Object} the value to be found. This will be compared against the object's
     * member using === equality.
     * @return {String} The first key whose value matches the one supplied, or <code>null</code> if no
     * such key is found.
     */
    fluid.keyForValue = function (obj, value) {
        return fluid.find(obj, function (thisValue, key) {
            if (value === thisValue) {
                return key;
            }
        });
    };
    
    /**
     * This method is now deprecated and will be removed in a future release of Infusion.
     * See fluid.keyForValue instead.
     */
    fluid.findKeyInObject = fluid.keyForValue;
    
    /** Converts an array into an object whose keys are the elements of the array, each with the value "true"
     */
    
    fluid.arrayToHash = function (array) {
        var togo = {};
        fluid.each(array, function (el) {
            togo[el] = true;
        });
        return togo;
    };
    
    /**
     * Clears an object or array of its contents. For objects, each property is deleted.
     *
     * @param {Object|Array} target the target to be cleared
     */
    fluid.clear = function (target) {
        if (fluid.isArrayable(target)) {
            target.length = 0;
        } else {
            for (var i in target) {
                delete target[i];
            }
        }
    };
    
   /**
    * @param boolean ascending <code>true</code> if a comparator is to be returned which
    * sorts strings in descending order of length
    */
    fluid.compareStringLength = function (ascending) {
        return ascending ? function (a, b) {
            return a.length - b.length;
        } : function (a, b) {
            return b.length - a.length;
        };
    };
    
    fluid.logLevelsSpec = {
        "FATAL":      0,
        "FAIL":       5,
        "WARN":      10,
        "IMPORTANT": 12, // The default logging "off" level - corresponds to the old "false"
        "INFO":      15, // The default logging "on" level - corresponds to the old "true"
        "TRACE":     20
    };

    /** A structure holding all supported log levels as supplied as a possible first argument to fluid.log
     * Members with a higher value of the "priority" field represent lower priority logging levels */
    // Moved down here since it uses fluid.transform on startup
    fluid.logLevel = fluid.transform(fluid.logLevelsSpec, function (value, key) {
        return {type: "fluid.marker", value: key, priority: value};
    });
    var logLevelStack = [fluid.logLevel.IMPORTANT]; // The stack of active logging levels, with the current level at index 0
    
    /** A set of special "marker values" used in signalling in function arguments and return values,
      * to partially compensate for JavaScript's lack of distinguished types. These should never appear
      * in JSON structures or other kinds of static configuration. An API specifically documents if it
      * accepts or returns any of these values, and if so, what its semantic is  - most are of private
      * use internal to the framework **/
    
    /** A special "marker object" representing that a distinguished
     * (probably context-dependent) value should be substituted.
     */
    fluid.VALUE = {type: "fluid.marker", value: "VALUE"};
    
    /** A special "marker object" representing that no value is present (where
     * signalling using the value "undefined" is not possible - e.g. the return value from a "strategy") */
    fluid.NO_VALUE = {type: "fluid.marker", value: "NO_VALUE"};
    
    /** A marker indicating that a value requires to be expanded after component construction begins **/
    fluid.EXPAND = {type: "fluid.marker", value: "EXPAND"};
    /** A marker indicating that a value requires to be expanded immediately **/
    fluid.EXPAND_NOW = {type: "fluid.marker", value: "EXPAND_NOW"};
    
    /** Determine whether an object is any marker, or a particular marker - omit the
     * 2nd argument to detect any marker
     */
    fluid.isMarker = function (totest, type) {
        if (!totest || typeof (totest) !== 'object' || totest.type !== "fluid.marker") {
            return false;
        }
        if (!type) {
            return true;
        }
        return totest === type;
    };
    
    // Model functions
    fluid.model = {}; // cannot call registerNamespace yet since it depends on fluid.model
   
    /** Copy a source "model" onto a target **/
    fluid.model.copyModel = function (target, source) {
        fluid.clear(target);
        $.extend(true, target, source);
    };
    
    /** Parse an EL expression separated by periods (.) into its component segments.
     * @param {String} EL The EL expression to be split
     * @return {Array of String} the component path expressions.
     * TODO: This needs to be upgraded to handle (the same) escaping rules (as RSF), so that
     * path segments containing periods and backslashes etc. can be processed, and be harmonised
     * with the more complex implementations in fluid.pathUtil(data binding).
     */
    fluid.model.parseEL = function (EL) {
        return EL === "" ? [] : String(EL).split('.');
    };
    
    /** Compose an EL expression from two separate EL expressions. The returned
     * expression will be the one that will navigate the first expression, and then
     * the second, from the value reached by the first. Either prefix or suffix may be
     * the empty string **/
    
    fluid.model.composePath = function (prefix, suffix) {
        return prefix === "" ? suffix : (suffix === "" ? prefix : prefix + "." + suffix);
    };
    
    /** Compose any number of path segments, none of which may be empty **/
    fluid.model.composeSegments = function () {
        return fluid.makeArray(arguments).join(".");
    };
    
    /** Helpful alias for old-style API **/
    fluid.path = fluid.model.composeSegments;
    fluid.composePath = fluid.model.composePath;


    // unsupported, NON-API function
    fluid.requireDataBinding = function () {
        fluid.fail("Please include DataBinding.js in order to operate complex model accessor configuration");
    };
    
    fluid.model.setWithStrategy = fluid.model.getWithStrategy = fluid.requireDataBinding;
    
    // unsupported, NON-API function
    fluid.model.resolvePathSegment = function (root, segment, create, origEnv) {
        if (!origEnv && root.resolvePathSegment) {
            return root.resolvePathSegment(segment);
        }
        if (create && root[segment] === undefined) {
            // This optimisation in this heavily used function has a fair effect
            return root[segment] = {};
        }
        return root[segment];
    };

    // unsupported, NON-API function   
    fluid.model.pathToSegments = function (EL, config) {
        var parser = config && config.parser ? config.parser.parse : fluid.model.parseEL;
        var segs = typeof(EL) === "number" || typeof(EL) === "string" ? parser(EL) : EL;
        return segs;
    };
    
    // Overall strategy skeleton for all implementations of fluid.get/set
    fluid.model.accessImpl = function (root, EL, newValue, config, initSegs, returnSegs, traverser) {
        var segs = fluid.model.pathToSegments(EL, config);
        var initPos = 0;
        if (initSegs) {
            initPos = initSegs.length;
            segs = initSegs.concat(segs);
        }
        var uncess = newValue === fluid.NO_VALUE ? 0 : 1;
        var root = traverser(root, segs, initPos, config, uncess);
        if (newValue === fluid.NO_VALUE || newValue === fluid.VALUE) { // get or custom
            return returnSegs ? {root: root, segs: segs} : root;
        }
        else { // set
            root[segs[segs.length - 1]] = newValue;
        }
    };
    
    // unsupported, NON-API function
    fluid.model.accessSimple = function (root, EL, newValue, environment, initSegs, returnSegs) {
        return fluid.model.accessImpl(root, EL, newValue, environment, initSegs, returnSegs, fluid.model.traverseSimple);
    };

    // unsupported, NON-API function    
    fluid.model.traverseSimple = function (root, segs, initPos, environment, uncess) {
        var origEnv = environment;
        var limit = segs.length - uncess;
        for (var i = 0; i < limit; ++i) {
            if (!root) {
                return root;
            }
            var segment = segs[i];
            if (environment && environment[segment]) {
                root = environment[segment];
            } else {
                root = fluid.model.resolvePathSegment(root, segment, uncess === 1, origEnv);
            }
            environment = null;
        }
        return root;
    };
    
    fluid.model.setSimple = function (root, EL, newValue, environment, initSegs) {
        fluid.model.accessSimple(root, EL, newValue, environment, initSegs, false);
    };
    
    /** Optimised version of fluid.get for uncustomised configurations **/
    
    fluid.model.getSimple = function (root, EL, environment, initSegs) {
        if (EL === null || EL === undefined || EL.length === 0) {
            return root;
        }
        return fluid.model.accessSimple(root, EL, fluid.NO_VALUE, environment, initSegs, false);
    };
    
    // unsupported, NON-API function
    // Returns undefined to signal complex configuration which needs to be farmed out to DataBinding.js
    // any other return represents an environment value AND a simple configuration we can handle here
    fluid.decodeAccessorArg = function (arg3) {
        return (!arg3 || arg3 === fluid.model.defaultGetConfig || arg3 === fluid.model.defaultSetConfig) ?
            null : (arg3.type === "environment" ? arg3.value : undefined);
    };
    
    fluid.set = function (root, EL, newValue, config, initSegs) {
        var env = fluid.decodeAccessorArg(config);
        if (env === undefined) {
            fluid.model.setWithStrategy(root, EL, newValue, config, initSegs);
        } else {
            fluid.model.setSimple(root, EL, newValue, env, initSegs);
        }
    };
    
    /** Evaluates an EL expression by fetching a dot-separated list of members
     * recursively from a provided root.
     * @param root The root data structure in which the EL expression is to be evaluated
     * @param {string/array} EL The EL expression to be evaluated, or an array of path segments
     * @param config An optional configuration or environment structure which can customise the fetch operation
     * @return The fetched data value.
     */
    
    fluid.get = function (root, EL, config, initSegs) {
        var env = fluid.decodeAccessorArg(config);
        return env === undefined ?
            fluid.model.getWithStrategy(root, EL, config, initSegs)
            : fluid.model.accessImpl(root, EL, fluid.NO_VALUE, env, null, false, fluid.model.traverseSimple);
    };

    // This backward compatibility will be maintained for a number of releases, probably until Fluid 2.0
    fluid.model.setBeanValue = fluid.set;
    fluid.model.getBeanValue = fluid.get;
    
    fluid.getGlobalValue = function (path, env) {
        if (path) {
            env = env || fluid.environment;
            return fluid.get(globalObject, path, {type: "environment", value: env});
        }
    };
    
    /**
     * Allows for the binding to a "this-ist" function
     * @param {Object} obj, "this-ist" object to bind to
     * @param {Object} fnName, the name of the function to call
     * @param {Object} args, arguments to call the function with
     */
    fluid.bind = function (obj, fnName, args) {
        return obj[fnName].apply(obj, fluid.makeArray(args));
    }
    
    /**
     * Allows for the calling of a function from an EL expression "functionPath", with the arguments "args", scoped to an framework version "environment".
     * @param {Object} functionPath - An EL expression
     * @param {Object} args - An array of arguments to be applied to the function, specified in functionPath
     * @param {Object} environment - (optional) The object to scope the functionPath to  (typically the framework root for version control)
     */
    fluid.invokeGlobalFunction = function (functionPath, args, environment) {
        var func = fluid.getGlobalValue(functionPath, environment);
        if (!func) {
            fluid.fail("Error invoking global function: " + functionPath + " could not be located");
        } else {
            // FLUID-4915: Fixes an issue for IE8 by defaulting to an empty array when args are falsey.
            return func.apply(null, args || []);
        }
    };
    
    /** Registers a new global function at a given path (currently assumes that
     * it lies within the fluid namespace)
     */
    
    fluid.registerGlobalFunction = function (functionPath, func, env) {
        env = env || fluid.environment;
        fluid.set(globalObject, functionPath, func, {type: "environment", value: env});
    };
    
    fluid.setGlobalValue = fluid.registerGlobalFunction;
    
    /** Ensures that an entry in the global namespace exists **/
    fluid.registerNamespace = function (naimspace, env) {
        env = env || fluid.environment;
        var existing = fluid.getGlobalValue(naimspace, env);
        if (!existing) {
            existing = {};
            fluid.setGlobalValue(naimspace, existing, env);
        }
        return existing;
    };
    
    // stubs for two functions in FluidDebugging.js
    fluid.dumpEl = fluid.identity;
    fluid.renderTimestamp = fluid.identity;
    
    
    /*** The Model Events system. ***/
    
    fluid.registerNamespace("fluid.event");
    
    fluid.generateUniquePrefix = function () {
        return (Math.floor(Math.random() * 1e12)).toString(36) + "-";
    };
    
    var fluid_prefix = fluid.generateUniquePrefix();
    
    var fluid_guid = 1;
    
    /** Allocate an string value that will be very likely unique within this Fluid scope (frame or process) **/
    
    fluid.allocateGuid = function () {
        return fluid_prefix + (fluid_guid++);
    };
    
    fluid.event.identifyListener = function (listener) {
        if (!listener.$$fluid_guid) {
            listener.$$fluid_guid = fluid.allocateGuid();
        }
        return listener.$$fluid_guid;
    };
    
    // unsupported, NON-API function
    fluid.event.impersonateListener = function (origListener, newListener) {
        fluid.event.identifyListener(origListener);
        newListener.$$fluid_guid = origListener.$$fluid_guid;
    };
    
    // unsupported, NON-API function
    fluid.event.mapPriority = function (priority, count) {
        return (priority === null || priority === undefined ? count :
           (priority === "last" ? Number.MAX_VALUE :
              (priority === "first" ? -Number.MAX_VALUE : -priority)));
    };
    
    // unsupported, NON-API function
    fluid.priorityComparator = function (recA, recB) {
        return recA.priority - recB.priority;
    };
    
    // unsupported, NON-API function
    fluid.event.sortListeners = function (listeners) {
        var togo = [];
        fluid.each(listeners, function (listener) {
            togo.push(listener);
        });
        return togo.sort(fluid.priorityComparator);
    };
    
    // unsupported, NON-API function
    fluid.event.resolveListener = function (listener) {
        if (listener.globalName) {
            var listenerFunc = fluid.getGlobalValue(listener.globalName);
            if (!listenerFunc) {
                fluid.fail("Unable to look up name " + listener.globalName + " as a global function");
            } else {
                listener = listenerFunc;
            }
        }
        return listener;
    };
    
    /** Generate a name for a component for debugging purposes */
    fluid.nameComponent = function (that) {
        return that ? "component with typename " + that.typeName + " and id " + that.id : "[unknown component]";
    };
    
    fluid.event.nameEvent = function (that, eventName) {
        return eventName + " of " + fluid.nameComponent(that);
    };
    
    /** Construct an "event firer" object which can be used to register and deregister
     * listeners, to which "events" can be fired. These events consist of an arbitrary
     * function signature. General documentation on the Fluid events system is at
     * http://wiki.fluidproject.org/display/fluid/The+Fluid+Event+System .
     * @param {Boolean} unicast If <code>true</code>, this is a "unicast" event which may only accept
     * a single listener.
     * @param {Boolean} preventable If <code>true</code> the return value of each handler will
     * be checked for <code>false</code> in which case further listeners will be shortcircuited, and this
     * will be the return value of fire()
     */
    fluid.makeEventFirer = function (unicast, preventable, name) {
        var listeners; // = {}
        var byId; // = {}
        var sortedListeners; // = []
        
        function fireToListeners(listeners, args, wrapper) {
            if (!listeners) { return; }
            fluid.log("Firing event " + name + " to list of " + listeners.length + " listeners");
            for (var i = 0; i < listeners.length; ++i) {
                var lisrec = listeners[i];
                lisrec.listener = fluid.event.resolveListener(lisrec.listener);
                var listener = lisrec.listener;

                if (lisrec.predicate && !lisrec.predicate(listener, args)) {
                    continue;
                }
                var value;
                var ret = (wrapper ? wrapper(listener) : listener).apply(null, args);
                if (preventable && ret === false) {
                    value = false;
                }
                if (unicast) {
                    value = ret;
                }
                if (value !== undefined) {
                    return value;
                }
            }
        }
        var identify = fluid.event.identifyListener;
        
        var that;
        var lazyInit = function () { // Lazy init function to economise on object references
            listeners = {};
            byId = {};
            sortedListeners = [];
            that.addListener = function (listener, namespace, predicate, priority) {
                if (!listener) {
                    return;
                }
                if (unicast) {
                    namespace = "unicast";
                }
                if (typeof(listener) === "string") {
                    listener = {globalName: listener};
                }
                var id = identify(listener);
                namespace = namespace || id;
                var record = {listener: listener, predicate: predicate,
                    namespace: namespace,
                    priority: fluid.event.mapPriority(priority, sortedListeners.length)};

                listeners[namespace] = byId[id] = record;
                sortedListeners = fluid.event.sortListeners(listeners);
            };
            that.addListener.apply(null, arguments);
        };
        that = {
            name: name,
            typeName: "fluid.event.firer",
            addListener: function () {
                lazyInit.apply(null, arguments);
            },

            removeListener: function (listener) {
                if (!listeners) { return; }
                var namespace;
                if (typeof (listener) === "string") {
                    namespace = listener;
                    var record = listeners[listener];
                    if (!record) {
                        return;
                    }
                    listener = record.listener;
                }
                var id = identify(listener);
                if (!id) {
                    fluid.fail("Cannot remove unregistered listener function ", listener, " from event " + that.name);
                }
                namespace = namespace || (byId[id] && byId[id].namespace) || id;
                delete byId[id];
                delete listeners[namespace];
                sortedListeners = fluid.event.sortListeners(listeners);
            },
            // NB - this method exists currently solely for the convenience of the new,
            // transactional changeApplier. As it exists it is hard to imagine the function
            // being helpful to any other client. We need to get more experience on the kinds
            // of listeners that are useful, and ultimately factor this method away.
            fireToListeners: function (listeners, args, wrapper) {
                return fireToListeners(listeners, args, wrapper);
            },
            fire: function () {
                return fireToListeners(sortedListeners, arguments);
            }
        };
        return that;
    };
    
    // This name will be deprecated in Fluid 2.0 for fluid.makeEventFirer (or fluid.eventFirer)
    fluid.event.getEventFirer = fluid.makeEventFirer;
    
    /** Fire the specified event with supplied arguments. This call is an optimisation utility
     * which handles the case where the firer has not been instantiated (presumably as a result
     * of having no listeners registered)
     */
     
    fluid.fireEvent = function (component, path, args) {
        var firer = fluid.get(component, path);
        if (firer) {
            firer.fire.apply(null, fluid.makeArray(args));
        }
    };
    
    // unsupported, NON-API function
    fluid.event.addListenerToFirer = function (firer, value, namespace, wrapper) {
        wrapper = wrapper || fluid.identity;
        if (fluid.isArrayable(value)) {
            for (var i = 0; i < value.length; ++i) {
                fluid.event.addListenerToFirer(firer, value[i], namespace, wrapper);
            }
        } else if (typeof (value) === "function" || typeof (value) === "string") {
            wrapper(firer).addListener(value, namespace);
        } else if (value && typeof (value) === "object") {
            wrapper(firer).addListener(value.listener, namespace || value.namespace, value.predicate, value.priority);
        }
    };
    
    // unsupported, NON-API function - non-IOC passthrough
    fluid.event.resolveListenerRecord = function (records) {
        return { records: records };
    };
    
    // unsupported, NON-API function
    fluid.mergeListeners = function (that, events, listeners) {
        fluid.each(listeners, function (value, key) {
            var firer, namespace;
            if (key.charAt(0) === "{") {
                if (!fluid.expandOptions) {
                    fluid.fail("fluid.expandOptions could not be loaded - please include FluidIoC.js in order to operate IoC-driven event with descriptor " +
                        key);
                }
                firer = fluid.expandOptions(key, that);
                if (!firer) {
                    fluid.fail("Error in listener record: key " + key + " could not be looked up to an event firer - did you miss out \"events.\" when referring to an event firer?");
                }
            } else {
                var keydot = key.indexOf(".");
            
                if (keydot !== -1) {
                    namespace = key.substring(keydot + 1);
                    key = key.substring(0, keydot);
                }
                if (!events[key]) {
                    fluid.fail("Listener registered for event " + key + " which is not defined for this component");
                    events[key] = fluid.makeEventFirer(null, null, fluid.event.nameEvent(that, key));
                }
                firer = events[key];
            }
            record = fluid.event.resolveListenerRecord(value, that, key);
            fluid.event.addListenerToFirer(firer, record.records, namespace, record.adderWrapper);
        });
    };
    
    // unsupported, NON-API function
    fluid.eventFromRecord = function (eventSpec, eventKey, that) {
        var isIoCEvent = eventSpec && (typeof (eventSpec) !== "string" || eventSpec.charAt(0) === "{");
        var event;
        if (isIoCEvent) {
            if (!fluid.event.resolveEvent) {
                fluid.fail("fluid.event.resolveEvent could not be loaded - please include FluidIoC.js in order to operate IoC-driven event with descriptor ",
                    eventSpec);
            } else {
                event = fluid.event.resolveEvent(that, eventKey, eventSpec);
            }
        } else {
            event = fluid.makeEventFirer(eventSpec === "unicast", eventSpec === "preventable", fluid.event.nameEvent(that, eventKey));
        }
        return event;
    };
    
    // unsupported, NON-API function - this is patched from FluidIoC.js
    fluid.instantiateFirers = function (that, options) {
        fluid.each(options.events, function (eventSpec, eventKey) {
            that.events[eventKey] = fluid.eventFromRecord(eventSpec, eventKey, that);
        });
    };
    
    fluid.mergeListenerPolicy = function (target, source, key) {
        // cf. triage in mergeListeners
        var hasNamespace = key.charAt(0) !== "{" && key.indexOf(".") !== -1;
        return hasNamespace ? (source ? source : target)
            : fluid.makeArray(target).concat(fluid.makeArray(source));
    };
    
    fluid.mergeListenersPolicy = function (target, source) {
        target = target || {};
        fluid.each(source, function (listeners, key) {
            target[key] = fluid.mergeListenerPolicy(target[key], listeners, key);
        });
        return target;
    };
    
    /** Removes duplicated and empty elements from an already sorted array **/
    fluid.unique = function (array) {
        return fluid.remove_if(array, function (element, i) {
            return !element || i > 0 && element === array[i - 1];
        });
    };
    
    fluid.arrayConcatPolicy = function (target, source) {
        return fluid.makeArray(target).concat(fluid.makeArray(source));
    };
    
    fluid.uniqueArrayConcatPolicy = function (target, source) {
        target = (target || []).concat(source);
        fluid.unique(target.sort());
        return target;
    };
    
    /*** DEFAULTS AND OPTIONS MERGING SYSTEM ***/
    
    var gradeTick = 1; // tick counter for managing grade cache invalidation    
    var gradeTickStore = {};
    
    var defaultsStore = {};
        
    var resolveGradesImpl = function (gs, gradeNames) {
        gradeNames = fluid.makeArray(gradeNames);
        fluid.each(gradeNames, function (gradeName) {
            if (!gs.gradeHash[gradeName]) {
                var options = fluid.rawDefaults(gradeName) || {};
                var thisTick = gradeTickStore[gradeName] || (gradeTick - 1); // a nonexistent grade is recorded as previous to current
                gs.lastTick = Math.max(gs.lastTick, thisTick);
                gs.gradeHash[gradeName] = true;
                gs.gradeChain.push(gradeName);
                gs.optionsChain.push(options);
                var oGradeNames = fluid.makeArray(options.gradeNames);
                fluid.each(oGradeNames, function (gradeName) {
                    if (gradeName !== "autoInit" && gradeName.charAt(0) !== "{") {
                        resolveGradesImpl(gs, gradeName);
                    }
                });
            }
        });
        return gs;
    };
    
    // unsupported, NON-API function
    fluid.resolveGradeStructure = function (defaultName, defaultGrades, gradeNames) {
        var gradeStruct = {
            lastTick: 0,
            gradeChain: [defaultName],
            gradeHash: {},
            optionsChain: [] // this has already been fetched in resolveGrade
        };
        gradeStruct.gradeHash[defaultName] = true;
        // TODO: this algorithm will fail if extra grades are mutually redundant and supplied out of dependency order
        // expectation is that stronger grades appear to the left in defaults - dynamic grades are stronger still
        return resolveGradesImpl(gradeStruct, (gradeNames || []).concat(fluid.makeArray(defaultGrades)));
    };
        
    var mergedDefaultsCache = {};

    // unsupported, NON-API function    
    fluid.gradeNamesToKey = function (gradeNames, defaultName) {
        return defaultName + "|" + fluid.makeArray(gradeNames).sort().join("|");
    };
    
    fluid.hasGrade = function (options, gradeName) {
        return !options || !options.gradeNames ? false : fluid.contains(options.gradeNames, gradeName);
    };
    
    // unsupported, NON-API function
    fluid.resolveGrade = function (defaults, defaultName, gradeNames) {
        var mergeArgs = [defaults];
        var gradeStruct = fluid.resolveGradeStructure(defaultName, defaults && defaults.gradeNames, gradeNames);
        mergeArgs = gradeStruct.optionsChain.reverse().concat(mergeArgs).concat({gradeNames: gradeStruct.gradeChain});
        var mergePolicy = {};
        for (var i = 0; i < mergeArgs.length; ++ i) {
            if (mergeArgs[i] && mergeArgs[i].mergePolicy) {
                mergePolicy = $.extend(true, mergePolicy, mergeArgs[i].mergePolicy);
            }
        }
        mergeArgs = [mergePolicy, {}].concat(mergeArgs);
        var mergedDefaults = fluid.merge.apply(null, mergeArgs);
        if (!fluid.hasGrade(defaults, "autoInit")) {
            fluid.remove_if(mergedDefaults.gradeNames, function (gradeName) { return gradeName === "autoInit";});
        }
        return {defaults: mergedDefaults, lastTick: gradeStruct && gradeStruct.lastTick};
    };

    // unsupported, NON-API function    
    fluid.getGradedDefaults = function (defaultName, gradeNames) {
        var key = fluid.gradeNamesToKey(gradeNames, defaultName);
        var mergedDefaults = mergedDefaultsCache[key];
        if (mergedDefaults) {
            var lastTick = 0; // check if cache should be invalidated through real latest tick being later than the one stored
            var searchGrades = mergedDefaults.defaults.gradeNames || [];
            for (var i = 0; i < searchGrades.length; ++ i) {
                lastTick = Math.max(lastTick, gradeTickStore[searchGrades[i]] || 0);  
            }
            if (lastTick > mergedDefaults.lastTick) {
                fluid.log("Clearing cache for component " + defaultName + " with gradeNames ", searchGrades);
                mergedDefaults = null;
            }
        }
        if (!mergedDefaults) {
            var defaults = fluid.rawDefaults(defaultName);
            if (!defaults) {
                return defaults;
            }
            mergedDefaults = mergedDefaultsCache[key] = fluid.resolveGrade(defaults, defaultName, gradeNames);
        }
        return mergedDefaults.defaults;
    };
    
    // unsupported, NON-API function
    fluid.rawDefaults = function (componentName, options) {
        if (options === undefined) {
            return defaultsStore[componentName];
        } else {
            defaultsStore[componentName] = options;
            gradeTickStore[componentName] = gradeTick++;
        }
    };
    
    fluid.doIndexDefaults = function (defaultName, defaults, index, indexSpec) {
        var requiredGrades = fluid.makeArray(indexSpec.gradeNames);
        for (var i = 0; i < requiredGrades.length; ++ i) {
            if (!fluid.hasGrade(defaults, requiredGrades[i])) return;
        }
        var indexFunc = typeof(indexSpec.indexFunc) === "function" ? indexSpec.indexFunc : fluid.getGlobalValue(indexSpec.indexFunc); 
        var keys = indexFunc(defaults) || [];
        for (var j = 0; j < keys.length; ++ j) {
            (index[keys[j]] = index[keys[j]] || []).push(defaultName);
        }
    };
    
    /** Evaluates an index specification over all the defaults records registered into the system.
     * @param indexName {String} The name of this index record (currently ignored)
     * @param indexSpec {Object} Specification of the index to be performed - fields:
     *     gradeNames: {String/Array of String} List of grades that must be matched by this indexer
     *     indexFunc:  {String/Function} An index function which accepts a defaults record and returns a list of keys
     * @return A structure indexing keys to lists of matched gradenames
     */
    // The expectation is that this function is extremely rarely used with respect to registration of defaults
    // in the system, so currently we do not make any attempts to cache the results. The field "indexName" is
    // supplied in case a future implementation chooses to implement caching
    fluid.indexDefaults = function (indexName, indexSpec) {
        var index = {};
        for (var defaultName in defaultsStore) {
            var defaults = fluid.getGradedDefaults(defaultName);
            fluid.doIndexDefaults(defaultName, defaults, index, indexSpec);    
        }
        return index;
    };
    
    /**
     * Retrieves and stores a component's default settings centrally.
     * @param {String} componentName the name of the component
     * @param {Object} (optional) an container of key/value pairs to set
     */
     
    fluid.defaults = function (componentName, options) {
        if (options === undefined) {
            return fluid.getGradedDefaults(componentName);
        }
        else {
            if (options && options.options) {
                fluid.fail("Probable error in options structure for " + componentName +
                    " with option named \"options\" - perhaps you meant to write these options at top level in fluid.defaults? - ", options);
            }
            fluid.rawDefaults(componentName, options);
            if (fluid.hasGrade(options, "autoInit")) {
                fluid.makeComponent(componentName, fluid.getGradedDefaults(componentName));
            }
        }
    };
    
    fluid.makeComponent = function (componentName, options) {
        if (!options.initFunction || !options.gradeNames) {
            fluid.fail("Cannot autoInit component " + componentName + " which does not have an initFunction and gradeNames defined");
        }
        var creator = function () {
            return fluid.initComponent(componentName, arguments);
        };
        var existing = fluid.getGlobalValue(componentName);
        if (existing) {
            $.extend(creator, existing);
        }
        fluid.setGlobalValue(componentName, creator);
    };
        
    fluid.makeComponents = function (components, env) {
        fluid.each(components, function (value, key) {
            var options = {
                gradeNames: fluid.makeArray(value).concat(["autoInit"])
            };
            fluid.defaults(key, options);
        });
    };

    // Cheapskate implementation which avoids dependency on DataBinding.js
    fluid.model.mergeModel = function (target, source) {
        if (!fluid.isPrimitive(target)) {
            var copySource = fluid.copy(source);
            $.extend(true, source, target);
            $.extend(true, source, copySource);
        }
        return source;
    };
    
    var emptyPolicy = {};
    // unsupported, NON-API function
    fluid.derefMergePolicy = function (policy) {
        return (policy? policy["*"]: emptyPolicy) || emptyPolicy;
    };
    
    // unsupported, NON-API function
    fluid.compileMergePolicy = function (mergePolicy) {
        var builtins = {}, defaultValues = {};
        var togo = {builtins: builtins, defaultValues: defaultValues};
        
        if (!mergePolicy) {
            return togo;
        }
        fluid.each(mergePolicy, function (value, key) {
            var parsed = {}, builtin = false;
            if (typeof(value) === "function") {
                parsed.func = value;
                builtin = true;
            }
            else if (!fluid.isDefaultValueMergePolicy(value)) {
                var split = value.split(/\s*,\s*/);
                for (var i = 0; i < split.length; ++ i) {
                    parsed[split[i]] = true;
                }
                builtin = true;
            }
            else {
                // Convert to ginger self-reference - NB, this can only be parsed by IoC
                fluid.set(defaultValues, key, "{that}.options." + value);
                togo.hasDefaults = true;
            }
            if (builtin) {
                fluid.set(builtins, fluid.composePath(key, "*"), parsed);
            }
        });
        return togo;
    };

    // TODO: deprecate this method of detecting default value merge policies before 1.6 in favour of
    // explicit typed records a la ModelTransformations
    // unsupported, NON-API function
    fluid.isDefaultValueMergePolicy = function (policy) {
        return typeof(policy) === "string"
            && (policy.indexOf(",") === -1 && !/replace|preserve|nomerge|noexpand/.test(policy));
    };

    // unsupported, NON-API function    
    fluid.mergeOneImpl = function (thisTarget, thisSource, j, sources, newPolicy, i, segs) {
        var togo = thisTarget;

        var primitiveTarget = fluid.isPrimitive(thisTarget);

        if (thisSource !== undefined) {
            if (!newPolicy.func && thisSource !== null && typeof (thisSource) === "object" &&
                    !fluid.isDOMish(thisSource) && thisSource !== fluid.VALUE &&
                    !newPolicy.preserve && !newPolicy.nomerge) {
                if (primitiveTarget) {
                    togo = thisTarget = fluid.freshContainer(thisSource);
                }
                // recursion is now external? We can't do it from here since sources are not all known
                // options.recurse(thisTarget, i + 1, segs, sources, newPolicyHolder, options);
            } else {
                sources[j] = undefined;
                if (newPolicy.func) {
                    togo = newPolicy.func.call(null, thisTarget, thisSource, segs[i - 1], segs, i); // NB - change in this mostly unused argument
                } else {
                    togo = fluid.isValue(thisTarget) && newPolicy.preserve ? fluid.model.mergeModel(thisTarget, thisSource) : thisSource;
                }
            }
        }
        return togo;
    };
    // NB - same quadratic worry about these as in FluidIoC in the case the RHS trundler is live - 
    // since at each regeneration step driving the RHS we are discarding the "cursor arguments" these
    // would have to be regenerated at each step - although in practice this can only happen once for
    // each object for all time, since after first resolution it will be concrete.
    function regenerateCursor (source, segs, limit, sourceStrategy) {
        for (var i = 0; i < limit; ++ i) {
            source = sourceStrategy(source, segs[i], i, segs);
        }
        return source;
    }
    
    function regenerateSources (sources, segs, limit, sourceStrategies) {
        var togo = [];
        for (var i = 0; i < sources.length; ++ i) {
            var thisSource = regenerateCursor(sources[i], segs, limit, sourceStrategies[i]);
            if (thisSource !== undefined) {
                togo.push(thisSource);
            }
        }
        return togo;
    }
    
    // unsupported, NON-API function
    fluid.fetchMergeChildren = function (target, i, segs, sources, mergePolicy, options) {
        var thisPolicy = fluid.derefMergePolicy(mergePolicy);
        for (var j = sources.length - 1; j >= 0; -- j) { // this direction now irrelevant - control is in the strategy
            var source = sources[j];
            // NB - this detection relies on strategy return being complete objects - which they are
            // although we need to set up the roots separately. We need to START the process of evaluating each
            // object root (sources) COMPLETELY, before we even begin! Even if the effect of this is to cause a
            // dispatch into ourselves almost immediately. We can do this because we can take control over our
            // TARGET objects and construct them early. Even if there is a self-dispatch, it will be fine since it is
            // DIRECTED and so will not trouble our "slow" detection of properties. After all self-dispatches end, control
            // will THEN return to "evaluation of arguments" (expander blocks) and only then FINALLY to this "slow" 
            // traversal of concrete properties to do the final merge.
            if (source !== undefined) {
                fluid.each(source, function (newSource, name) {
                    if (!target.hasOwnProperty(name)) { // only request each new target key once -- all sources will be queried per strategy
                        segs[i] = name;
                        options.strategy(target, name, i + 1, segs, sources, mergePolicy);
                    }
                });
                if (thisPolicy.replace) { // this branch primarily deals with a policy of replace at the root
                    break;
                }
            }
        }
        return target;
    };
    
    // A special marker object which will be placed at a current evaluation point in the tree in order
    // to protect against circular evaluation
    fluid.inEvaluationMarker = {"__CURRENTLY_IN_EVALUATION__": true};
    
    // A path depth above which the core "process strategies" will bail out, assuming that the 
    // structure has become circularly linked. Helpful in environments such as Firebug which will
    // kill the browser process if they happen to be open when a stack overflow occurs. Also provides
    // a more helpful diagnostic.
    fluid.strategyRecursionBailout = 50;
    
    // unsupported, NON-API function
    fluid.makeMergeStrategy = function (options) {
        var strategy = function (target, name, i, segs, sources, policy) {
            if (i > fluid.strategyRecursionBailout) {
                fluid.fail("Overflow/circularity in options merging, current path is ", segs, " at depth " , i, " - please protect components from merging using the \"nomerge\" merge policy");
            }
            if (fluid.isTracing) {
                fluid.tracing.pathCount.push(fluid.path(segs.slice(0, i)));
            }

            var oldTarget = undefined;
            if (target.hasOwnProperty(name)) { // bail out if our work has already been done
                oldTarget = target[name];
                if (!options.evaluateFully) { // see notes on this hack in "initter" - early attempt to deal with FLUID-4930
                    return oldTarget;
                }
            }
            else { // This is hardwired here for performance reasons - no need to protect deeper strategies
                target[name] = fluid.inEvaluationMarker;
            }
            if (sources === undefined) { // recover our state in case this is an external entry point
                segs = fluid.makeArray(segs); // avoid trashing caller's segs
                sources = regenerateSources(options.sources, segs, i - 1, options.sourceStrategies);
                policy = regenerateCursor(options.mergePolicy, segs, i - 1, fluid.concreteTrundler);
            }
            // var thisPolicy = fluid.derefMergePolicy(policy);
            var newPolicyHolder = fluid.concreteTrundler(policy, name);
            var newPolicy = fluid.derefMergePolicy(newPolicyHolder);

            var start, limit, mul;
            if (newPolicy.replace) {
                start = 1 - sources.length; limit = 0; mul = -1;
            }
            else {
                start = 0; limit = sources.length - 1; mul = +1;
            }
            var newSources = [];
            var thisTarget = undefined;

            for (var j = start; j <= limit; ++j) { // TODO: try to economise on this array and on gaps
                var k = mul * j;
                var thisSource = options.sourceStrategies[k](sources[k], name, i, segs); // Run the RH algorithm in "driving" mode
                if (thisSource !== undefined) {
                    newSources[k] = thisSource;
                    if (oldTarget === undefined) {
                        if (mul === -1) { // if we are going backwards, it is "replace"
                            thisTarget = target[name] = thisSource;
                            break;
                        }
                        else {
                            // write this in early, since early expansions may generate a trunk object which is written in to by later ones
                            thisTarget = target[name] = fluid.mergeOneImpl(thisTarget, thisSource, j, newSources, newPolicy, i, segs, options);
                        }
                    }
                }
            }
            if (oldTarget !== undefined) {
                thisTarget = oldTarget;
            }
            if (newSources.length > 0) {
                if (!fluid.isPrimitive(thisTarget)) {
                    fluid.fetchMergeChildren(thisTarget, i, segs, newSources, newPolicyHolder, options);
                }
            }
            if (oldTarget === undefined && newSources.length === 0) {
                delete target[name]; // remove the evaluation marker - nothing to evaluate
            }
            return thisTarget;
        };
        options.strategy = strategy;
        return strategy;
    };
    
    // A simple stand-in for "fluid.get" where the material is covered by a single strategy  
    fluid.driveStrategy = function (root, pathSegs, strategy) {
        pathSegs = fluid.makeArray(pathSegs);
        for (var i = 0; i < pathSegs.length; ++ i) {
            if (!root) {
                return undefined;
            }
            root = strategy(root, pathSegs[i], i + 1, pathSegs);
        }
        return root;
    };
    
    // A very simple "new inner trundler" that just performs concrete property access
    // Note that every "strategy" is also a "trundler" of this type, considering just the first two arguments
    fluid.concreteTrundler = function (source, seg) {
        return !source? undefined : source[seg];
    };
    
    /** Merge a collection of options structures onto a target, following an optional policy.
     * This method is now used only for the purpose of merging "dead" option documents in order to
     * cache graded component defaults. Component option merging is now performed by the 
     * fluid.makeMergeOptions pathway which sets up a deferred merging process. This function
     * will not be removed in the Fluid 2.0 release but it is recommended that users not call it
     * directly.
     * The behaviour of this function is explained more fully on
     * the page http://wiki.fluidproject.org/display/fluid/Options+Merging+for+Fluid+Components .
     * @param policy {Object/String} A "policy object" specifiying the type of merge to be performed.
     * If policy is of type {String} it should take on the value "replace" representing
     * a static policy. If it is an
     * Object, it should contain a mapping of EL paths onto these String values, representing a
     * fine-grained policy. If it is an Object, the values may also themselves be EL paths
     * representing that a default value is to be taken from that path.
     * @param options1, options2, .... {Object} an arbitrary list of options structure which are to
     * be merged together. These will not be modified.
     */
        
    fluid.merge = function (policy /*, ... sources */) {
        var sources = Array.prototype.slice.call(arguments, 1);
        var compiled = fluid.compileMergePolicy(policy).builtins;
        var options = fluid.makeMergeOptions(compiled, sources, {});
        options.initter();
        return options.target;
    };
    
    // unsupported, NON-API function    
    fluid.simpleGingerBlock = function (source, recordType) {
        var block = {
            target: source,
            simple: true,
            strategy: fluid.concreteTrundler,
            initter: fluid.identity,
            recordType: recordType,
            priority: fluid.mergeRecordTypes[recordType]
        };
        return block;
    };
    
    // unsupported, NON-API function    
    fluid.makeMergeOptions = function (policy, sources, userOptions) {
        var options = {
            mergePolicy: policy,
            sources: sources,
            seenIds: {}
        };
        options = $.extend(options, userOptions);
        options.target = options.target || fluid.freshContainer(options.sources[0]);
        options.sourceStrategies = options.sourceStrategies || fluid.generate(options.sources.length, fluid.concreteTrundler);
        options.initter = function () {
            // This hack is necessary to ensure that the FINAL evaluation doesn't balk when discovering a trunk path which was already 
            // visited during self-driving via the expander. This bi-modality is sort of rubbish, but we currently don't have "room" 
            // in the strategy API to express when full evaluation is required - and the "flooding API" is not standardised.
            options.evaluateFully = true;
            fluid.fetchMergeChildren(options.target, 0, [], options.sources, options.mergePolicy, options);
        };
        fluid.makeMergeStrategy(options);
        return options;
    };

    // unsupported, NON-API function
    fluid.transformOptions = function (options, transRec) {
        fluid.expect("Options transformation record", ["transformer", "config"], transRec);
        var transFunc = fluid.getGlobalValue(transRec.transformer);
        return transFunc.call(null, options, transRec.config);
    };

    // unsupported, NON-API function    
    fluid.findMergeBlocks = function (mergeBlocks, recordType) {
        return fluid.remove_if(fluid.makeArray(mergeBlocks), function (block) { return block.recordType !== recordType; });
    };
    
    // unsupported, NON-API function    
    fluid.transformOptionsBlocks = function (mergeBlocks, transformOptions, recordTypes) {
        fluid.each(recordTypes, function (recordType) {       
            var blocks = fluid.findMergeBlocks(mergeBlocks, recordType);
            fluid.each(blocks, function (block) {
                block[block.simple? "target": "source"] = fluid.transformOptions(block.source, transformOptions);
            });
        });
    };
    
    // unsupported, NON-API function
    fluid.deliverOptionsStrategy = fluid.identity;
    fluid.computeComponentAccessor = fluid.identity;
    fluid.computeDynamicComponents = fluid.identity;

    // The (extensible) types of merge record the system supports, with the weakest records first    
    fluid.mergeRecordTypes = {
        defaults:             0,
        localOptions:        50, // provisional
        defaultValueMerge:  100,
        subcomponentRecord: 200,
        distribution:       300,
        // rendererDecorator:  400, // TODO, these are probably honoured already as "user"
        user:               500,
        demands:            600 // and above
    };

    /**
     * Merges the component's declared defaults, as obtained from fluid.defaults(),
     * with the user's specified overrides.
     *
     * @param {Object} that the instance to attach the options to
     * @param {String} componentName the unique "name" of the component, which will be used
     * to fetch the default options from store. By recommendation, this should be the global
     * name of the component's creator function.
     * @param {Object} userOptions the user-specified configuration options for this component
     */
    // unsupported, NON-API function
    fluid.mergeComponentOptions = function (that, componentName, userOptions, localOptions) {
        var rawDefaults = fluid.rawDefaults(componentName);
        var defaults = fluid.getGradedDefaults(componentName, rawDefaults && rawDefaults.gradeNames ? null : localOptions.gradeNames);
        var sharedMergePolicy = {};

        var mergeBlocks = [];

        if (fluid.expandComponentOptions) {
            mergeBlocks = mergeBlocks.concat(fluid.expandComponentOptions(sharedMergePolicy, defaults, userOptions, that));
        }
        else {
            mergeBlocks = mergeBlocks.concat([fluid.simpleGingerBlock(defaults, "defaults"), 
                                              fluid.simpleGingerBlock(userOptions, "user")]);
        }
        var options = {}; // ultimate target
        var sourceStrategies = [], sources = [];
        var baseMergeOptions = {
            target: options,
            sourceStrategies: sourceStrategies
        };
        // Called both from here and from IoC whenever there is a change of block content or arguments which
        // requires them to be resorted and rebound
        var updateBlocks = function () {
            mergeBlocks.sort(fluid.priorityComparator);
            sourceStrategies.length = 0; sources.length = 0;
            fluid.each(mergeBlocks, function (block) {
                sourceStrategies.push(block.strategy);
                sources.push(block.target);
            });
        };
        updateBlocks();
        var mergeOptions = fluid.makeMergeOptions(sharedMergePolicy, sources, baseMergeOptions);
        mergeOptions.mergeBlocks = mergeBlocks;
        mergeOptions.updateBlocks = updateBlocks;
        
        // Decode the now available mergePolicy
        var mergePolicy = fluid.driveStrategy(options, "mergePolicy", mergeOptions.strategy);
        mergePolicy = $.extend({}, fluid.rootMergePolicy, mergePolicy);
        var compiledPolicy = fluid.compileMergePolicy(mergePolicy);
        // TODO: expandComponentOptions has already put some builtins here - performance implications of the now huge
        // default mergePolicy material need to be investigated as well as this deep merge
        $.extend(true, sharedMergePolicy, compiledPolicy.builtins); // ensure it gets broadcast to all sharers
        
        if (compiledPolicy.hasDefaults) {
            if (fluid.generateExpandBlock) {
                mergeBlocks.push(fluid.generateExpandBlock({
                        options: compiledPolicy.defaultValues,
                        recordType: "defaultValueMerge",
                        priority: fluid.mergeRecordTypes.defaultValueMerge
                    }, that, {}));
                updateBlocks();
            }
            else {
                fluid.fail("Cannot operate mergePolicy ", mergePolicy, " for component ", that, " without including FluidIoC.js");
            }
        }
        that.options = options;
        var optionsNickName = fluid.driveStrategy(options, "nickName", mergeOptions.strategy);
        that.nickName = optionsNickName || fluid.computeNickName(that.typeName);
        fluid.driveStrategy(options, "gradeNames", mergeOptions.strategy);
        
        fluid.deliverOptionsStrategy(that, options, mergeOptions); // do this early to broadcast and receive "distributeOptions"
        
        var transformOptions = fluid.driveStrategy(options, "transformOptions", mergeOptions.strategy);
        if (transformOptions) {
            fluid.transformOptionsBlocks(mergeBlocks, transformOptions, ["user", "subcomponentRecord"]);
            updateBlocks(); // because the possibly simple blocks may have changed target
        }
                
        fluid.computeComponentAccessor(that);

        return mergeOptions;
    };
    
    // The Fluid Component System proper
        
    // The base system grade definitions
    
    fluid.defaults("fluid.function", {});
    
    fluid.lifecycleFunctions = {
        preInitFunction: true,
        postInitFunction: true,
        finalInitFunction: true
    };
    
    fluid.rootMergePolicy = $.extend({
            gradeNames: fluid.uniqueArrayConcatPolicy,
            distributeOptions: fluid.arrayConcatPolicy,
            transformOptions: "replace"
        },
        fluid.transform(fluid.lifecycleFunctions, function () {
            return fluid.mergeListenerPolicy;
    }));
    
    fluid.defaults("fluid.littleComponent", {
        gradeNames: ["autoInit"],
        initFunction: "fluid.initLittleComponent",
        mergePolicy: fluid.rootMergePolicy,
        argumentMap: {
            options: 0
        }
    });
    
    fluid.defaults("fluid.eventedComponent", {
        gradeNames: ["fluid.littleComponent", "autoInit"],
        events: { // Four standard lifecycle points common to all components
            onCreate:  null,
            onAttach:  null, // events other than onCreate are only fired for IoC-configured components
            onClear:   null,
            onDestroy: null
        },
        mergePolicy: {
            listeners: fluid.mergeListenersPolicy
        }
    });
    
    
    fluid.preInitModelComponent = function (that) {
        that.model = that.options.model || {};
        that.applier = that.options.applier || (fluid.makeChangeApplier ? fluid.makeChangeApplier(that.model, that.options.changeApplierOptions) : null);
    };
    
    fluid.defaults("fluid.modelComponent", {
        gradeNames: ["fluid.littleComponent", "autoInit"],
        preInitFunction: {
            namespace: "preInitModelComponent",
            listener: "fluid.preInitModelComponent"
        },
        mergePolicy: {
            model: "preserve",
            applier: "nomerge"
        }
    });
    
    /** A special "marker object" which is recognised as one of the arguments to
     * fluid.initSubcomponents. This object is recognised by reference equality -
     * where it is found, it is replaced in the actual argument position supplied
     * to the specific subcomponent instance, with the particular options block
     * for that instance attached to the overall "that" object.
     * NOTE: The use of this marker has been deprecated as of the Fluid 1.4 release in
     * favour of the contextual EL path "{options}" - it will be removed in a future
     * release of the framework.
     */
    fluid.COMPONENT_OPTIONS = {type: "fluid.marker", value: "COMPONENT_OPTIONS"};
    
    /** Construct a dummy or "placeholder" subcomponent, that optionally provides empty
     * implementations for a set of methods.
     */
    // TODO: this method is inefficient and inappropriate, should simply discard options entirely pending review 
    fluid.emptySubcomponent = function (options) {
        var that = fluid.typeTag("fluid.emptySubcomponent");
        that.options = options || {};
        that.options.gradeNames = [that.typeName];
        
        options = fluid.makeArray(options);
        for (var i = 0; i < options.length; ++i) {
            that[options[i]] = fluid.identity;
        }
        return that;
    };
    
    /** Compute a "nickname" given a fully qualified typename, by returning the last path
     * segment.
     */
    
    fluid.computeNickName = function (typeName) {
        var segs = fluid.model.parseEL(typeName);
        return segs[segs.length - 1];
    };
        
    /** Create a "type tag" component with no state but simply a type name and id. The most
     *  minimal form of Fluid component */
       
    fluid.typeTag = function (name) {
        return name ? {
            typeName: name,
            id: fluid.allocateGuid()
        } : null;
    };
    
    /** A combined "component and grade name" which allows type tags to be declaratively constructed
     * from options material. Any component found bearing this grade will be instantiated first amongst
     * its set of siblings, since it is likely to bear a context-forming type name */
    
    fluid.typeFount = function (options) {
        var that = fluid.initLittleComponent("fluid.typeFount", options);
        return fluid.typeTag(that.options.targetTypeName);
    };
    
    /**
     * Creates a new "little component": a that-ist object with options merged into it by the framework.
     * This method is a convenience for creating small objects that have options but don't require full
     * View-like features such as the DOM Binder or events
     *
     * @param {Object} name the name of the little component to create
     * @param {Object} options user-supplied options to merge with the defaults
     */
    // NOTE: the 3rd argument localOptions is NOT to be advertised as part of the stable API, it is present
    // just to allow backward compatibility whilst grade specifications are not mandatory - similarly for 4th arg "receiver"
    fluid.initLittleComponent = function (name, userOptions, localOptions, receiver) {
        var that = fluid.typeTag(name);
        localOptions = localOptions || {gradeNames: "fluid.littleComponent"};
        
        var mergeOptions = fluid.mergeComponentOptions(that, name, userOptions, localOptions);
        var options = that.options;
        var evented = fluid.hasGrade(options, "fluid.eventedComponent");
        if (evented) {
            that.events = {};
        }
        // deliver to a non-IoC side early receiver of the component (currently only initView)
        (receiver || fluid.identity)(that, options, mergeOptions.strategy);
        fluid.computeDynamicComponents(that, mergeOptions);
        
        // TODO: ****THIS**** is the point we must deliver and suspend!! Construct the "component skeleton" first, and then continue
        // for as long as we can continue to find components.
        for (var i = 0; i < mergeOptions.mergeBlocks.length; ++ i) {
            mergeOptions.mergeBlocks[i].initter();
        }
        mergeOptions.initter();
        delete options.mergePolicy;
        
        fluid.initLifecycleFunctions(that);
        fluid.fireEvent(options, "preInitFunction", that);

        if (evented) {
            fluid.instantiateFirers(that, options);
            fluid.mergeListeners(that, that.events, options.listeners);
        }
        if (!fluid.hasGrade(options, "autoInit")) {
            fluid.clearLifecycleFunctions(options);
        }
        return that;
    };

    // unsupported, NON-API function    
    fluid.updateWithDefaultLifecycle = function (key, value, typeName) {
        var funcName = typeName + "." + key.substring(0, key.length - "function".length);
        var funcVal = fluid.getGlobalValue(funcName);
        if (typeof (funcVal) === "function") {
            value = fluid.makeArray(value);
            var existing = fluid.find(value, function (el) {
                var listener = el.listener || el;
                if (listener === funcVal || listener === funcName) {
                    return true;
                }
            });
            if (!existing) {
                value.push(funcVal);
            }
        }
        return value;
    };
    
    // unsupported, NON-API function
    fluid.initLifecycleFunctions = function (that) {
        var gradeNames = that.options.gradeNames || [];
        fluid.each(fluid.lifecycleFunctions, function (func, key) {
            var value = that.options[key];
            for (var i = gradeNames.length - 1; i >= 0; -- i) { // most specific grades are at front
                if (gradeNames[i] !== "autoInit") {
                    value = fluid.updateWithDefaultLifecycle(key, value, gradeNames[i]);
                }
            }
            if (value) {
                that.options[key] = fluid.makeEventFirer(null, null, key);
                fluid.event.addListenerToFirer(that.options[key], value);
            }
        });
    };
    
    // unsupported, NON-API function
    fluid.clearLifecycleFunctions = function (options) {
        fluid.each(fluid.lifecycleFunctions, function (value, key) {
            delete options[key];
        });
        delete options.initFunction;
    };

    fluid.diagnoseFailedView = fluid.identity;

    // unsupported, NON-API function    
    fluid.makeRootDestroy = function (that) {
        return function () {
            fluid.fireEvent(that, "events.onClear", [that, "", null]);
            fluid.fireEvent(that, "events.onDestroy", [that, "", null]);
        };
    };
    
    fluid.resolveReturnedPath = fluid.identity;

    // unsupported, NON-API function    
    fluid.initComponent = function (componentName, initArgs) {
        var options = fluid.defaults(componentName);
        if (!options.gradeNames) {
            fluid.fail("Cannot initialise component " + componentName + " which has no gradeName registered");
        }
        var args = [componentName].concat(fluid.makeArray(initArgs)); // TODO: support different initFunction variants
        var that;
        fluid.pushActivity("initComponent", "constructing component of type %componentName with arguments %initArgs",
            {componentName: componentName, initArgs: initArgs});
        that = fluid.invokeGlobalFunction(options.initFunction, args);
        fluid.diagnoseFailedView(componentName, that, options, args);
        fluid.fireEvent(that.options, "postInitFunction", that);
        if (fluid.initDependents) {
            fluid.initDependents(that);
        }
        fluid.fireEvent(that.options, "finalInitFunction", that);
        fluid.clearLifecycleFunctions(that.options);
        that.destroy = fluid.makeRootDestroy(that); // overwritten by FluidIoC for constructed subcomponents
        fluid.fireEvent(that, "events.onCreate", that);
        fluid.popActivity();
        return fluid.resolveReturnedPath(that.options.returnedPath, that) ? fluid.get(that, that.options.returnedPath) : that;
    };

    // unsupported, NON-API function
    fluid.initSubcomponentImpl = function (that, entry, args) {
        var togo;
        if (typeof (entry) !== "function") {
            var entryType = typeof (entry) === "string" ? entry : entry.type;
            togo = entryType === "fluid.emptySubcomponent" ?
                fluid.emptySubcomponent(entry.options) :
                fluid.invokeGlobalFunction(entryType, args);
        } else {
            togo = entry.apply(null, args);
        }

        // TODO: deprecate "returnedOptions" and incorporate into regular ginger world system
        var returnedOptions = togo ? togo.returnedOptions : null;
        if (returnedOptions && returnedOptions.listeners) {
            fluid.mergeListeners(that, that.events, returnedOptions.listeners);
        }
        return togo;
    };
    
    /** Initialise all the "subcomponents" which are configured to be attached to
     * the supplied top-level component, which share a particular "class name". This method
     * of instantiating components is deprecated and will be removed in favour of the automated
     * IoC system in the Fluid 2.0 release.
     * @param {Component} that The top-level component for which sub-components are
     * to be instantiated. It contains specifications for these subcomponents in its
     * <code>options</code> structure.
     * @param {String} className The "class name" or "category" for the subcomponents to
     * be instantiated. A class name specifies an overall "function" for a class of
     * subcomponents and represents a category which accept the same signature of
     * instantiation arguments.
     * @param {Array of Object} args The instantiation arguments to be passed to each
     * constructed subcomponent. These will typically be members derived from the
     * top-level <code>that</code> or perhaps globally discovered from elsewhere. One
     * of these arguments may be <code>fluid.COMPONENT_OPTIONS</code> in which case this
     * placeholder argument will be replaced by instance-specific options configured
     * into the member of the top-level <code>options</code> structure named for the
     * <code>className</code>
     * @return {Array of Object} The instantiated subcomponents, one for each member
     * of <code>that.options[className]</code>.
     */
    
    fluid.initSubcomponents = function (that, className, args) {
        var entry = that.options[className];
        if (!entry) {
            return;
        }
        var entries = fluid.makeArray(entry);
        var optindex = -1;
        var togo = [];
        args = fluid.makeArray(args);
        for (var i = 0; i < args.length; ++i) {
            if (args[i] === fluid.COMPONENT_OPTIONS) {
                optindex = i;
            }
        }
        for (i = 0; i < entries.length; ++i) {
            entry = entries[i];
            if (optindex !== -1) {
                args[optindex] = entry.options;
            }
            togo[i] = fluid.initSubcomponentImpl(that, entry, args);
        }
        return togo;
    };
        
    fluid.initSubcomponent = function (that, className, args) {
        return fluid.initSubcomponents(that, className, args)[0];
    };
    
    // Definitions for ThreadLocals, the static and dynamic environment - lifted here from
    // FluidIoC.js so that we can issue calls to fluid.describeActivity for debugging purposes
    // in the core framework
    
    // unsupported, non-API function
    fluid.singleThreadLocal = function (initFunc) {
        var value = initFunc();
        return function (newValue) {
            return newValue === undefined ? value : value = newValue;
        };
    };
    
    // Currently we only support single-threaded environments - ensure that this function
    // is not used on startup so it can be successfully monkey-patched
    // unsupported, non-API function
    fluid.threadLocal = fluid.singleThreadLocal;

    // unsupported, non-API function    
    fluid.globalThreadLocal = fluid.threadLocal(function () {
        return fluid.typeTag("fluid.dynamicEnvironment");
    });
    
    fluid.staticEnvironment = fluid.typeTag("fluid.staticEnvironment");

  
    // ******* SELECTOR ENGINE *********
      
    // selector regexps copied from jQuery - recent versions correct the range to start C0
    // The initial portion of the main character selector "just add water" to add on extra 
    // accepted characters, as well as the "\\\\." -> "\." portion necessary for matching 
    // period characters escaped in selectors
    var charStart = "(?:[\\w\u00c0-\uFFFF*_-";
  
    fluid.simpleCSSMatcher = {
        regexp: new RegExp("([#.]?)(" + charStart + "]|\\\\.)+)", "g"),
        charToTag: {
            "": "tag",
            "#": "id",
            ".": "clazz"
        }
    };
    
    fluid.IoCSSMatcher = {
        regexp: new RegExp("([&#]?)(" + charStart + "]|\\.)+)", "g"),
        charToTag: {
            "": "context",
            "&": "context",
            "#": "id"
        }
    };
    
    var childSeg = new RegExp("\\s*(>)?\\s*", "g");
//    var whiteSpace = new RegExp("^\\w*$");
  
    // Parses a selector expression into a data structure holding a list of predicates
    // 2nd argument is a "strategy" structure, e.g.  fluid.simpleCSSMatcher or fluid.IoCSSMatcher
    // unsupported, non-API function
    fluid.parseSelector = function (selstring, strategy) {
        var togo = [];
        selstring = $.trim(selstring);
        //ws-(ss*)[ws/>]
        var regexp = strategy.regexp;
        regexp.lastIndex = 0;
        var lastIndex = 0;
        while (true) {
            var atNode = []; // a list of predicates at a particular node
            var first = true;
            while (true) {
                var segMatch = regexp.exec(selstring);
                if (!segMatch) {
                    break;
                }
                if (segMatch.index !== lastIndex) {
                    if (first) {
                        fluid.fail("Error in selector string - cannot match child selector expression starting at " + selstring.substring(lastIndex));
                    }
                    else {
                        break;
                    }
                }
                var thisNode = {};
                var text = segMatch[2];
                var targetTag = strategy.charToTag[segMatch[1]];
                if (targetTag) {
                    thisNode[targetTag] = text;
                }
                atNode[atNode.length] = thisNode;
                lastIndex = regexp.lastIndex;
                first = false;
            }
            childSeg.lastIndex = lastIndex;
            var fullAtNode = {predList: atNode};
            var childMatch = childSeg.exec(selstring);
            if (!childMatch || childMatch.index !== lastIndex) {
                fluid.fail("Error in selector string - can not match child selector expression at " + selstring.substring(lastIndex));
            }
            if (childMatch[1] === ">") {
                fullAtNode.child = true;
            }
            togo[togo.length] = fullAtNode;
            // >= test here to compensate for IE bug http://blog.stevenlevithan.com/archives/exec-bugs
            if (childSeg.lastIndex >= selstring.length) {
                break;
            }
            lastIndex = childSeg.lastIndex;
            regexp.lastIndex = childSeg.lastIndex;
        }
        return togo;
    };

    // Message resolution and templating
   
   /**
    * Converts a string to a regexp with the specified flags given in parameters
    * @param {String} a string that has to be turned into a regular expression
    * @param {String} the flags to provide to the reg exp
    */
    fluid.stringToRegExp = function (str, flags) {
        return new RegExp(str.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, "\\$&"), flags);
    };
    
    /**
     * Simple string template system.
     * Takes a template string containing tokens in the form of "%value".
     * Returns a new string with the tokens replaced by the specified values.
     * Keys and values can be of any data type that can be coerced into a string. Arrays will work here as well.
     *
     * @param {String}    template    a string (can be HTML) that contains tokens embedded into it
     * @param {object}    values      a collection of token keys and values
     */
    fluid.stringTemplate = function (template, values) {
        var keys = fluid.keys(values);
        keys = keys.sort(fluid.compareStringLength());
        for (var i = 0; i < keys.length; ++i) {
            var key = keys[i];
            var re = fluid.stringToRegExp("%" + key, "g");
            template = template.replace(re, values[key]);
        }
        return template;
    };
    

    fluid.messageResolver = function (options) {
        var that = fluid.initLittleComponent("fluid.messageResolver", options);
        that.messageBase = that.options.parseFunc(that.options.messageBase);
        
        that.lookup = function (messagecodes) {
            var resolved = fluid.messageResolver.resolveOne(that.messageBase, messagecodes);
            if (resolved === undefined) {
                return fluid.find(that.options.parents, function (parent) {
                    return parent ? parent.lookup(messagecodes) : undefined;
                });
            } else {
                return {template: resolved, resolveFunc: that.options.resolveFunc};
            }
        };
        that.resolve = function (messagecodes, args) {
            if (!messagecodes) {
                return "[No messagecodes provided]";
            }
            messagecodes = fluid.makeArray(messagecodes);
            var looked = that.lookup(messagecodes);
            return looked ? looked.resolveFunc(looked.template, args) :
                "[Message string for key " + messagecodes[0] + " not found]";
        };
        
        return that;
    };
    
    fluid.defaults("fluid.messageResolver", {
        mergePolicy: {
            messageBase: "nomerge",
            parents: "nomerge"
        },
        resolveFunc: fluid.stringTemplate,
        parseFunc: fluid.identity,
        messageBase: {},
        parents: []
    });

    // unsupported, NON-API function    
    fluid.messageResolver.resolveOne = function (messageBase, messagecodes) {
        for (var i = 0; i < messagecodes.length; ++i) {
            var code = messagecodes[i];
            var message = messageBase[code];
            if (message !== undefined) {
                return message;
            }
        }
    };
          
    /** Converts a data structure consisting of a mapping of keys to message strings,
     * into a "messageLocator" function which maps an array of message codes, to be
     * tried in sequence until a key is found, and an array of substitution arguments,
     * into a substituted message string.
     */
    fluid.messageLocator = function (messageBase, resolveFunc) {
        var resolver = fluid.messageResolver({messageBase: messageBase, resolveFunc: resolveFunc});
        return function (messagecodes, args) {
            return resolver.resolve(messagecodes, args);
        };
    };

})(jQuery, fluid_1_5);
/*
Copyright 2007-2010 University of Cambridge
Copyright 2007-2009 University of Toronto
Copyright 2010-2011 Lucendo Development Ltd.
Copyright 2010 OCAD University

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

/** This file contains functions which depend on the presence of a DOM document
 * but which do not depend on the contents of Fluid.js **/

// Declare dependencies
/*global fluid_1_5:true, jQuery*/

// JSLint options 
/*jslint white: true, funcinvoke: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

var fluid_1_5 = fluid_1_5 || {};

(function ($, fluid) {

    // Private constants.
    var NAMESPACE_KEY = "fluid-scoped-data";

    /**
     * Gets stored state from the jQuery instance's data map.
     * This function is unsupported: It is not really intended for use by implementors.
     */
    fluid.getScopedData = function(target, key) {
        var data = $(target).data(NAMESPACE_KEY);
        return data ? data[key] : undefined;
    };

    /**
     * Stores state in the jQuery instance's data map. Unlike jQuery's version,
     * accepts multiple-element jQueries.
     * This function is unsupported: It is not really intended for use by implementors.
     */
    fluid.setScopedData = function(target, key, value) {
        $(target).each(function() {
            var data = $.data(this, NAMESPACE_KEY) || {};
            data[key] = value;

            $.data(this, NAMESPACE_KEY, data);
        });
    };

    /** Global focus manager - makes use of "focusin" event supported in jquery 1.4.2 or later.
     */

    var lastFocusedElement = null;
    
    $(document).bind("focusin", function(event){
        lastFocusedElement = event.target;
    });
    
    fluid.getLastFocusedElement = function() {
        return lastFocusedElement;
    }


    var ENABLEMENT_KEY = "enablement";

    /** Queries or sets the enabled status of a control. An activatable node
     * may be "disabled" in which case its keyboard bindings will be inoperable
     * (but still stored) until it is reenabled again.
     * This function is unsupported: It is not really intended for use by implementors.
     */
     
    fluid.enabled = function(target, state) {
        target = $(target);
        if (state === undefined) {
            return fluid.getScopedData(target, ENABLEMENT_KEY) !== false;
        }
        else {
            $("*", target).add(target).each(function() {
                if (fluid.getScopedData(this, ENABLEMENT_KEY) !== undefined) {
                    fluid.setScopedData(this, ENABLEMENT_KEY, state);
                }
                else if (/select|textarea|input/i.test(this.nodeName)) {
                    $(this).prop("disabled", !state);
                }
            });
            fluid.setScopedData(target, ENABLEMENT_KEY, state);
        }
    };
    
    fluid.initEnablement = function(target) {
        fluid.setScopedData(target, ENABLEMENT_KEY, true);
    };
    
    // This function is necessary since simulation of focus events by jQuery under IE
    // is not sufficiently good to intercept the "focusin" binding. Any code which triggers
    // focus or blur synthetically throughout the framework and client code must use this function,
    // especially if correct cross-platform interaction is required with the "deadMansBlur" function.
    
    function applyOp(node, func) {
        node = $(node);
        node.trigger("fluid-"+func);
        node[func]();
    }
    
    $.each(["focus", "blur"], function(i, name) {
        fluid[name] = function(elem) {
            applyOp(elem, name);
        }
    });
    
})(jQuery, fluid_1_5);
/*
Copyright 2008-2010 University of Cambridge
Copyright 2008-2009 University of Toronto

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global fluid_1_5:true, jQuery */

// JSLint options 
/*jslint white: true, funcinvoke: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

var fluid_1_5 = fluid_1_5 || {};

(function ($, fluid) {
    
    fluid.dom = fluid.dom || {};
    
    // Node walker function for iterateDom.
    var getNextNode = function (iterator) {
        if (iterator.node.firstChild) {
            iterator.node = iterator.node.firstChild;
            iterator.depth += 1;
            return iterator;
        }
        while (iterator.node) {
            if (iterator.node.nextSibling) {
                iterator.node = iterator.node.nextSibling;
                return iterator;
            }
            iterator.node = iterator.node.parentNode;
            iterator.depth -= 1;
        }
        return iterator;
    };
    
    /**
     * Walks the DOM, applying the specified acceptor function to each element.
     * There is a special case for the acceptor, allowing for quick deletion of elements and their children.
     * Return "delete" from your acceptor function if you want to delete the element in question.
     * Return "stop" to terminate iteration. 
     
     * Implementation note - this utility exists mainly for performance reasons. It was last tested
     * carefully some time ago (around jQuery 1.2) but at that time was around 3-4x faster at raw DOM
     * filtration tasks than the jQuery equivalents, which was an important source of performance loss in the
     * Reorderer component. General clients of the framework should use this method with caution if at all, and
     * the performance issues should be reassessed when we have time. 
     * 
     * @param {Element} node the node to start walking from
     * @param {Function} acceptor the function to invoke with each DOM element
     * @param {Boolean} allnodes Use <code>true</code> to call acceptor on all nodes, 
     * rather than just element nodes (type 1)
     */
    fluid.dom.iterateDom = function (node, acceptor, allNodes) {
        var currentNode = {node: node, depth: 0};
        var prevNode = node;
        var condition;
        while (currentNode.node !== null && currentNode.depth >= 0 && currentNode.depth < fluid.dom.iterateDom.DOM_BAIL_DEPTH) {
            condition = null;
            if (currentNode.node.nodeType === 1 || allNodes) {
                condition = acceptor(currentNode.node, currentNode.depth);
            }
            if (condition) {
                if (condition === "delete") {
                    currentNode.node.parentNode.removeChild(currentNode.node);
                    currentNode.node = prevNode;
                }
                else if (condition === "stop") {
                    return currentNode.node;
                }
            }
            prevNode = currentNode.node;
            currentNode = getNextNode(currentNode);
        }
    };
    
    // Work around IE circular DOM issue. This is the default max DOM depth on IE.
    // http://msdn2.microsoft.com/en-us/library/ms761392(VS.85).aspx
    fluid.dom.iterateDom.DOM_BAIL_DEPTH = 256;
    
    /**
     * Checks if the specified container is actually the parent of containee.
     * 
     * @param {Element} container the potential parent
     * @param {Element} containee the child in question
     */
    fluid.dom.isContainer = function (container, containee) {
        for (; containee; containee = containee.parentNode) {
            if (container === containee) {
                return true;
            }
        }
        return false;
    };
       
    /** Return the element text from the supplied DOM node as a single String.
     * Implementation note - this is a special-purpose utility used in the framework in just one
     * position in the Reorderer. It only performs a "shallow" traversal of the text and was intended
     * as a quick and dirty means of extracting element labels where the user had not explicitly provided one.
     * It should not be used by general users of the framework and its presence here needs to be 
     * reassessed.
     */
    fluid.dom.getElementText = function (element) {
        var nodes = element.childNodes;
        var text = "";
        for (var i = 0; i < nodes.length; ++i) {
            var child = nodes[i];
            if (child.nodeType === 3) {
                text = text + child.nodeValue;
            }
        }
        return text; 
    };
    
})(jQuery, fluid_1_5);
/*
Copyright 2008-2010 University of Cambridge
Copyright 2008-2009 University of Toronto
Copyright 2010 Lucendo Development Ltd.

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global fluid_1_5:true, jQuery*/

// JSLint options 
/*jslint white: true, funcinvoke: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

fluid_1_5 = fluid_1_5 || {};

(function ($, fluid) {
      
  var unUnicode = /(\\u[\dabcdef]{4}|\\x[\dabcdef]{2})/g;
  
  fluid.unescapeProperties = function (string) {
    string = string.replace(unUnicode, function(match) {
      var code = match.substring(2);
      var parsed = parseInt(code, 16);
      return String.fromCharCode(parsed);
      }
    );
    var pos = 0;
    while (true) {
        var backpos = string.indexOf("\\", pos);
        if (backpos === -1) {
            break;
        }
        if (backpos === string.length - 1) {
          return [string.substring(0, string.length - 1), true];
        }
        var replace = string.charAt(backpos + 1);
        if (replace === "n") replace = "\n";
        if (replace === "r") replace = "\r";
        if (replace === "t") replace = "\t";
        string = string.substring(0, backpos) + replace + string.substring(backpos + 2);
        pos = backpos + 1;
    }
    return [string, false];
  };
  
  var breakPos = /[^\\][\s:=]/;
  
  fluid.parseJavaProperties = function(text) {
    // File format described at http://java.sun.com/javase/6/docs/api/java/util/Properties.html#load(java.io.Reader)
    var togo = {};
    text = text.replace(/\r\n/g, "\n");
    text = text.replace(/\r/g, "\n");
    lines = text.split("\n");
    var contin, key, valueComp, valueRaw, valueEsc;
    for (var i = 0; i < lines.length; ++ i) {
      var line = $.trim(lines[i]);
      if (!line || line.charAt(0) === "#" || line.charAt(0) === '!') {
          continue;
      }
      if (!contin) {
        valueComp = "";
        var breakpos = line.search(breakPos);
        if (breakpos === -1) {
          key = line;
          valueRaw = "";
          }
        else {
          key = $.trim(line.substring(0, breakpos + 1)); // +1 since first char is escape exclusion
          valueRaw = $.trim(line.substring(breakpos + 2));
          if (valueRaw.charAt(0) === ":" || valueRaw.charAt(0) === "=") {
            valueRaw = $.trim(valueRaw.substring(1));
          }
        }
      
        key = fluid.unescapeProperties(key)[0];
        valueEsc = fluid.unescapeProperties(valueRaw);
      }
      else {
        valueEsc = fluid.unescapeProperties(line);
      }

      contin = valueEsc[1];
      if (!valueEsc[1]) { // this line was not a continuation line - store the value
        togo[key] = valueComp + valueEsc[0];
      }
      else {
        valueComp += valueEsc[0];
      }
    }
    return togo;
  };
      
    /** 
     * Expand a message string with respect to a set of arguments, following a basic
     * subset of the Java MessageFormat rules. 
     * http://java.sun.com/j2se/1.4.2/docs/api/java/text/MessageFormat.html
     * 
     * The message string is expected to contain replacement specifications such
     * as {0}, {1}, {2}, etc.
     * @param messageString {String} The message key to be expanded
     * @param args {String/Array of String} An array of arguments to be substituted into the message.
     * @return The expanded message string. 
     */
    fluid.formatMessage = function (messageString, args) {
        if (!args) {
            return messageString;
        } 
        if (typeof(args) === "string") {
            args = [args];
        }
        for (var i = 0; i < args.length; ++ i) {
            messageString = messageString.replace("{" + i + "}", args[i]);
        }
        return messageString;
    };
      
})(jQuery, fluid_1_5);
/*
Copyright 2007-2010 University of Cambridge
Copyright 2007-2009 University of Toronto
Copyright 2007-2009 University of California, Berkeley
Copyright 2010 OCAD University
Copyright 2010-2011 Lucendo Development Ltd.

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global fluid:true, fluid_1_5:true, jQuery*/

// JSLint options 
/*jslint white: true, funcinvoke: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

var fluid_1_5 = fluid_1_5 || {};
var fluid = fluid || fluid_1_5;

(function ($, fluid) {
       
    fluid.renderTimestamp = function (date) {
        var zeropad = function (num, width) {
             if (!width) width = 2;
             var numstr = (num == undefined? "" : num.toString());
             return "00000".substring(5 - width + numstr.length) + numstr;
             }
        return zeropad(date.getHours()) + ":" + zeropad(date.getMinutes()) + ":" + zeropad(date.getSeconds()) + "." + zeropad(date.getMilliseconds(), 3);
    };

    fluid.isTracing = false;

    fluid.registerNamespace("fluid.tracing");

    fluid.tracing.pathCount = [];
    
    fluid.tracing.summarisePathCount = function (pathCount) {
        pathCount = pathCount || fluid.tracing.pathCount;
        var togo = {};
        for (var i = 0; i < pathCount.length; ++ i) {
            var path = pathCount[i];
            if (!togo[path]) {
                togo[path] = 1;
            }
            else {
                ++togo[path];
            }
        }
        var toReallyGo = [];
        fluid.each(togo, function(el, path) {
            toReallyGo.push({path: path, count: el});
        });
        toReallyGo.sort(function(a, b) {return b.count - a.count});
        return toReallyGo;
    };
    
    fluid.tracing.condensePathCount = function (prefixes, pathCount) {
        prefixes = fluid.makeArray(prefixes);
        var prefixCount = {};
        fluid.each(prefixes, function(prefix) {
            prefixCount[prefix] = 0;
        });
        var togo = [];
        fluid.each(pathCount, function(el) {
            var path = el.path;
            if (!fluid.find(prefixes, function(prefix) {
                if (path.indexOf(prefix) === 0) {
                    prefixCount[prefix] += el.count;
                    return true;
                }
            })) {
            togo.push(el);
            }
        });
        fluid.each(prefixCount, function(count, path) {
            togo.unshift({path: path, count: count});
        });
        return togo;
    };

    // Exception stripping code taken from https://github.com/emwendelin/javascript-stacktrace/blob/master/stacktrace.js
    // BSD licence, see header
    
    fluid.detectStackStyle = function (e) {
        var style = "other";
        var stackStyle = {
            offset: 0  
        };
        if (e["arguments"]) {
            style = "chrome";
        } else if (typeof window !== "undefined" && window.opera && e.stacktrace) {
            style = "opera10";
        } else if (e.stack) {
            style = "firefox";
            // Detect FireFox 4-style stacks which are 1 level less deep
            stackStyle.offset = e.stack.indexOf("Trace exception") === -1? 1 : 0;
        } else if (typeof window !== 'undefined' && window.opera && !('stacktrace' in e)) { //Opera 9-
            style = "opera";
        }
        stackStyle.style = style;
        return stackStyle;
    };
    
    fluid.obtainException = function() {
        try {
            throw new Error("Trace exception");
        }
        catch (e) {
            return e;
        }
    };
    
    var stackStyle = fluid.detectStackStyle(fluid.obtainException());

    fluid.registerNamespace("fluid.exceptionDecoders");
    
    fluid.decodeStack = function() {
        if (stackStyle.style !== "firefox") {
            return null;
        }
        var e = fluid.obtainException();
        return fluid.exceptionDecoders[stackStyle.style](e);
    };

    fluid.exceptionDecoders.firefox = function(e) {
        var lines = e.stack.replace(/(?:\n@:0)?\s+$/m, '').replace(/^\(/gm, '{anonymous}(').split('\n');
        return fluid.transform(lines, function(line) {
            var atind = line.indexOf("@");
            return atind === -1? [line] : [line.substring(atind + 1), line.substring(0, atind)];  
        });
    };
    
    fluid.getCallerInfo = function(atDepth) {
        atDepth = (atDepth || 3) - stackStyle.offset;
        var stack = fluid.decodeStack();
        return stack? stack[atDepth][0] : null;
    };
    
    function generate(c, count) {
        var togo = "";
        for (var i = 0; i < count; ++ i) {
            togo += c;
        }
        return togo;
    }
    
    function printImpl(obj, small, options) {
        var big = small + options.indentChars;
        if (obj === null) {
            return "null";
        }
        else if (fluid.isPrimitive(obj)) {
            return JSON.stringify(obj);
        }
        else {
            var j = [];
            if (fluid.isArrayable(obj)) {
                if (obj.length === 0) {
                    return "[]";
                }
                for (var i = 0; i < obj.length; ++ i) {
                    j[i] = printImpl(obj[i], big, options);
                }
                return "[\n" + big + j.join(",\n" + big) + "\n" + small + "]";
                }
            else {
                var i = 0;
                fluid.each(obj, function(value, key) {
                    j[i++] = JSON.stringify(key) + ": " + printImpl(value, big, options);
                });
                return "{\n" + big + j.join(",\n" + big) + "\n" + small + "}"; 
            }
        }
    }
    
    fluid.prettyPrintJSON = function(obj, options) {
        options = $.extend({indent: 4}, options);
        options.indentChars = generate(" ", options.indent);
        return printImpl(obj, "", options);
    }
        
    /** 
     * Dumps a DOM element into a readily recognisable form for debugging - produces a
     * "semi-selector" summarising its tag name, class and id, whichever are set.
     * 
     * @param {jQueryable} element The element to be dumped
     * @return A string representing the element.
     */
    fluid.dumpEl = function (element) {
        var togo;
        
        if (!element) {
            return "null";
        }
        if (element.nodeType === 3 || element.nodeType === 8) {
            return "[data: " + element.data + "]";
        } 
        if (element.nodeType === 9) {
            return "[document: location " + element.location + "]";
        }
        if (!element.nodeType && fluid.isArrayable(element)) {
            togo = "[";
            for (var i = 0; i < element.length; ++ i) {
                togo += fluid.dumpEl(element[i]);
                if (i < element.length - 1) {
                    togo += ", ";
                }
            }
            return togo + "]";
        }
        element = $(element);
        togo = element.get(0).tagName;
        if (element.id) {
            togo += "#" + element.id;
        }
        if (element.attr("class")) {
            togo += "." + element.attr("class");
        }
        return togo;
    };
        
})(jQuery, fluid_1_5);
    /*
Copyright 2008-2010 University of Cambridge
Copyright 2008-2009 University of Toronto
Copyright 2010-2011 Lucendo Development Ltd.
Copyright 2010 OCAD University

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global fluid_1_5:true, jQuery*/

// JSLint options 
/*jslint white: true, funcinvoke: true, continue: true, elsecatch: true, operator: true, jslintok:true, undef: true, newcap: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

var fluid_1_5 = fluid_1_5 || {};

(function ($, fluid) {
    
    fluid.BINDING_ROOT_KEY = "fluid-binding-root";
    
    /** Recursively find any data stored under a given name from a node upwards
     * in its DOM hierarchy **/
     
    fluid.findData = function (elem, name) {
        while (elem) {
            var data = $.data(elem, name);
            if (data) {
                return data;
            }
            elem = elem.parentNode;
        }
    };
  
    fluid.bindFossils = function (node, data, fossils) {
        $.data(node, fluid.BINDING_ROOT_KEY, {data: data, fossils: fossils});
    };
        
    fluid.boundPathForNode = function (node, fossils) {
        node = fluid.unwrap(node);
        var key = node.name || node.id;
        var record = fossils[key];
        return record ? record.EL : null;
    };
      
   /** "Automatically" apply to whatever part of the data model is
     * relevant, the changed value received at the given DOM node*/
    fluid.applyBoundChange = function (node, newValue, applier) {
        node = fluid.unwrap(node);
        if (newValue === undefined) {
            newValue = fluid.value(node);
        }
        if (node.nodeType === undefined && node.length > 0) {
            node = node[0];
        } // assume here that they share name and parent
        var root = fluid.findData(node, fluid.BINDING_ROOT_KEY);
        if (!root) {
            fluid.fail("Bound data could not be discovered in any node above " + fluid.dumpEl(node));
        }
        var name = node.name;
        var fossil = root.fossils[name];
        if (!fossil) {
            fluid.fail("No fossil discovered for name " + name + " in fossil record above " + fluid.dumpEl(node));
        }
        if (typeof(fossil.oldvalue) === "boolean") { // deal with the case of an "isolated checkbox"
            newValue = newValue[0] ? true : false;
        }
        var EL = root.fossils[name].EL;
        if (applier) {
            applier.fireChangeRequest({path: EL, value: newValue, source: node.id});
        } else {
            fluid.set(root.data, EL, newValue);
        }    
    };
    
    /** MODEL ACCESSOR ENGINE (trundler) **/
    
    /** Standard strategies for resolving path segments **/
    fluid.model.makeEnvironmentStrategy = function (environment) {
        return function (root, segment, index) {
            return index === 0 && environment[segment] ?
                environment[segment] : undefined; 
        };
    };

    fluid.model.defaultCreatorStrategy = function (root, segment) {
        if (root[segment] === undefined) {
            root[segment] = {};
            return root[segment];
        }
    };
    
    fluid.model.defaultFetchStrategy = function (root, segment) {
        return segment === "" ? root : root[segment];
    };
        
    fluid.model.funcResolverStrategy = function (root, segment) {
        if (root.resolvePathSegment) {
            return root.resolvePathSegment(segment);
        }
    };
    
    // unsupported, NON-API function
    fluid.model.traverseWithStrategy = function (root, segs, initPos, config, uncess) {
        var strategies = config.strategies;
        var limit = segs.length - uncess;
        for (var i = initPos; i < limit; ++i) {
            if (!root) {
                return root;
            }
            var accepted = undefined;
            for (var j = 0; j < strategies.length; ++ j) {
                accepted = strategies[j](root, segs[i], i + 1, segs);
                if (accepted !== undefined) {
                    break; // May now short-circuit with stateless strategies
                }
            }
            if (accepted === fluid.NO_VALUE) {
                accepted = undefined;
            }
            root = accepted;
        }
        return root;
    };
    
    /** Returns both the value and the path of the value held at the supplied EL path **/
    fluid.model.getValueAndSegments = function (root, EL, config, initSegs) {
        return fluid.model.accessWithStrategy(root, EL, fluid.NO_VALUE, config, initSegs, true);
    };
    
    // Very lightweight remnant of trundler, only used in resolvers
    // unsupported, NON-API function
    fluid.model.makeTrundler = function (config) {
        return function (valueSeg, EL) {
            return fluid.model.getValueAndSegments(valueSeg.root, EL, config, valueSeg.segs); 
        };  
    };
    
    fluid.model.getWithStrategy = function (root, EL, config, initSegs) {
        return fluid.model.accessWithStrategy(root, EL, fluid.NO_VALUE, config, initSegs);
    };
    
    fluid.model.setWithStrategy = function (root, EL, newValue, config, initSegs) {
        fluid.model.accessWithStrategy(root, EL, newValue, config, initSegs);
    };
    
    // unsupported, NON-API function
    fluid.model.accessWithStrategy = function (root, EL, newValue, config, initSegs, returnSegs) {
        // This function is written in this unfortunate style largely for efficiency reasons. In many cases
        // it should be capable of running with 0 allocations (EL is preparsed, initSegs is empty)
        if (!fluid.isPrimitive(EL) && !fluid.isArrayable(EL)) {
            var key = EL.type || "default";
            var resolver = config.resolvers[key];
            if (!resolver) {
                fluid.fail("Unable to find resolver of type " + key);
            }
            var trundler = fluid.model.makeTrundler(config); // very lightweight trundler for resolvers
            var valueSeg = {root: root, segs: initSegs};
            valueSeg = resolver(valueSeg, EL, trundler);
            if (EL.path && valueSeg) { // every resolver supports this piece of output resolution
                valueSeg = trundler(valueSeg, EL.path);
            }
            return returnSegs ? valueSeg : (valueSeg ? valueSeg.root : undefined);
        }
        else {
            return fluid.model.accessImpl(root, EL, newValue, config, initSegs, returnSegs, fluid.model.traverseWithStrategy);
        }
    };
  
    // Implementation notes: The EL path manipulation utilities here are somewhat more thorough
    // and expensive versions of those provided in Fluid.js - there is some duplication of 
    // functionality. This is a tradeoff between stability and performance - the versions in
    // Fluid.js are the most frequently used and do not implement escaping of characters .
    // as \. and \ as \\ as the versions here. The implementations here are not 
    // performant and are left here partially as an implementation note. Problems will
    // arise if clients manipulate JSON structures containing "." characters in keys as if they
    // are models. The basic  utilities fluid.path(), fluid.parseEL and fluid.composePath are 
    // the ones recommended for general users and the following implementations will
    // be upgraded to use regexes in future to make them better alternatives
   
    fluid.pathUtil = {};
   
    var getPathSegmentImpl = function (accept, path, i) {
        var segment = null; // TODO: rewrite this with regexes and replaces
        if (accept) {
            segment = "";
        }
        var escaped = false;
        var limit = path.length;
        for (; i < limit; ++i) {
            var c = path.charAt(i);
            if (!escaped) {
                if (c === '.') {
                    break;
                }
                else if (c === '\\') {
                    escaped = true;
                }
                else if (segment !== null) {
                    segment += c;
                }
            }
            else {
                escaped = false;
                if (segment !== null) {
                    segment += c;
                }
            }
        }
        if (segment !== null) {
            accept[0] = segment;
        }
        return i;
    };
    
    var globalAccept = []; // TODO: serious reentrancy risk here, why is this impl like this?
    
    /** Parses a path segment, following escaping rules, starting from character index i in the supplied path */
    fluid.pathUtil.getPathSegment = function (path, i) {
        getPathSegmentImpl(globalAccept, path, i);
        return globalAccept[0];
    }; 
  
    /** Returns just the head segment of an EL path */
    fluid.pathUtil.getHeadPath = function (path) {
        return fluid.pathUtil.getPathSegment(path, 0);
    };
  
    /** Returns all of an EL path minus its first segment - if the path consists of just one segment, returns "" */  
    fluid.pathUtil.getFromHeadPath = function (path) {
        var firstdot = getPathSegmentImpl(null, path, 0);
        return firstdot === path.length ? "" : path.substring(firstdot + 1);
    };
    
    function lastDotIndex(path) {
        // TODO: proper escaping rules
        return path.lastIndexOf(".");
    }

    /** Returns all of an EL path minus its final segment - if the path consists of just one segment, returns "" - 
     * WARNING - this method does not follow escaping rules */    
    fluid.pathUtil.getToTailPath = function (path) {
        var lastdot = lastDotIndex(path);
        return lastdot === -1 ? "" : path.substring(0, lastdot);
    };

    /** Returns the very last path component of an EL path 
     * WARNING - this method does not follow escaping rules */
    fluid.pathUtil.getTailPath = function (path) {
        var lastdot = lastDotIndex(path);
        return fluid.pathUtil.getPathSegment(path, lastdot + 1);
    };

    /** A version of fluid.model.parseEL that apples escaping rules - this allows path segments
     * to contain period characters . - characters "\" and "}" will also be escaped. WARNING - 
     * this current implementation is EXTREMELY slow compared to fluid.model.parseEL and should
     * not be used in performance-sensitive applications */
     
    fluid.pathUtil.parseEL = function (path) {
        var togo = [];
        var index = 0;
        var limit = path.length;
        while (index < limit) {
            var firstdot = getPathSegmentImpl(globalAccept, path, index);
            togo.push(globalAccept[0]);
            index = firstdot + 1;
        }
        return togo;
    };
    
    var composeSegment = function (prefix, toappend) {
        for (var i = 0; i < toappend.length; ++i) {
            var c = toappend.charAt(i);
            if (c === '.' || c === '\\' || c === '}') {
                prefix += '\\';
            }
            prefix += c;
        }
        return prefix;
    };
    
    /** Escapes a single path segment by replacing any character ".", "\" or "}" with
     * itself prepended by \
     */
    fluid.pathUtil.escapeSegment = function (segment) {
        return composeSegment("", segment);  
    };
    
    /**
     * Compose a prefix and suffix EL path, where the prefix is already escaped.
     * Prefix may be empty, but not null. The suffix will become escaped.
     */
    fluid.pathUtil.composePath = function (prefix, suffix) {
        if (prefix.length !== 0) {
            prefix += '.';
        }
        return composeSegment(prefix, suffix);
    };
    
    /** Helpful utility for use in resolvers - matches a path which has already been
      * parsed into segments **/
    
    fluid.pathUtil.matchSegments = function (toMatch, segs, start, end) {
        if (end - start !== toMatch.length) {
            return false;
        }
        for (var i = start; i < end; ++ i) {
            if (segs[i] !== toMatch[i - start]) {
                return false;
            }
        }
        return true;
    };
    
    /** Determine the path by which a given path is nested within another **/
    
    fluid.pathUtil.getExcessPath = function (base, longer) {
        var index = longer.indexOf(base);
        if (index !== 0) {
            fluid.fail("Path " + base + " is not a prefix of path " + longer);
        }
        if (base.length === longer.length) {
            return "";
        }
        if (longer[base.length] !== ".") {
            fluid.fail("Path " + base + " is not properly nested in path " + longer);
        }
        return longer.substring(base.length + 1);
    };
    
    /** Determines whether a particular EL path matches a given path specification.
     * The specification consists of a path with optional wildcard segments represented by "*".
     * @param spec (string) The specification to be matched
     * @param path (string) The path to be tested
     * @param exact (boolean) Whether the path must exactly match the length of the specification in
     * terms of path segments in order to count as match. If exact is falsy, short specifications will
     * match all longer paths as if they were padded out with "*" segments 
     * @return (string) The path which matched the specification, or <code>null</code> if there was no match
     */
   
    fluid.pathUtil.matchPath = function (spec, path, exact) {
        var togo = "";
        while (true) {
            if (((path === "") ^ (spec === "")) && exact) {
                return null;
            }
            // FLUID-4625 - symmetry on spec and path is actually undesirable, but this
            // quickly avoids at least missed notifications - improved (but slower) 
            // implementation should explode composite changes
            if (!spec || !path) {
                break;
            }
            var spechead = fluid.pathUtil.getHeadPath(spec);
            var pathhead = fluid.pathUtil.getHeadPath(path);
            // if we fail to match on a specific component, fail.
            if (spechead !== "*" && spechead !== pathhead) {
                return null;
            }
            togo = fluid.pathUtil.composePath(togo, pathhead);
            spec = fluid.pathUtil.getFromHeadPath(spec);
            path = fluid.pathUtil.getFromHeadPath(path);
        }
        return togo;
    };
        
    /** CHANGE APPLIER **/    
      
    fluid.model.isNullChange = function (model, request, resolverGetConfig) {
        if (request.type === "ADD") {
            var existing = fluid.get(model, request.path, resolverGetConfig);
            if (existing === request.value) {
                return true;
            }
        }
    };
    /** Applies the supplied ChangeRequest object directly to the supplied model.
     */
    fluid.model.applyChangeRequest = function (model, request, resolverSetConfig) {
        var pen = fluid.model.accessWithStrategy(model, request.path, fluid.VALUE, resolverSetConfig || fluid.model.defaultSetConfig, null, true);
        var last = pen.segs[pen.segs.length - 1];
        
        if (request.type === "ADD" || request.type === "MERGE") {
            if (pen.segs.length === 0 || (request.type === "MERGE" && pen.root[last])) {
                if (request.type === "ADD") {
                    fluid.clear(pen.root);
                }
                $.extend(true, pen.segs.length === 0 ? pen.root : pen.root[last], request.value);
            }
            else {
                pen.root[last] = request.value;
            }
        }
        else if (request.type === "DELETE") {
            if (pen.segs.length === 0) {
                fluid.clear(pen.root);
            }
            else {
                delete pen.root[last];
            }
        }
    };
        
    fluid.model.defaultGetConfig = {
        strategies: [fluid.model.funcResolverStrategy, fluid.model.defaultFetchStrategy]
    };

    fluid.model.defaultSetConfig = {
        strategies: [fluid.model.funcResolverStrategy, fluid.model.defaultFetchStrategy, fluid.model.defaultCreatorStrategy]
    };

    fluid.model.escapedGetConfig = {
        parser: {
            parse: fluid.pathUtil.parseEL,
            compose: fluid.pathUtil.composePath
        },
        strategies: [fluid.model.defaultFetchStrategy]
    };

    fluid.model.escapedSetConfig = {
        parser: {
            parse: fluid.pathUtil.parseEL,
            compose: fluid.pathUtil.composePath
        },
        strategies: [fluid.model.defaultFetchStrategy, fluid.model.defaultCreatorStrategy]
    };

    /** Add a listener to a ChangeApplier event that only acts in the case the event
     * has not come from the specified source (typically ourself)
     * @param modelEvent An model event held by a changeApplier (typically applier.modelChanged)
     * @param path The path specification to listen to
     * @param source The source value to exclude (direct equality used)
     * @param func The listener to be notified of a change
     * @param [eventName] - optional - the event name to be listened to - defaults to "modelChanged"
     * @param [namespace] - optional - the event namespace
     */
    fluid.addSourceGuardedListener = function(applier, path, source, func, eventName, namespace) {
        eventName = eventName || "modelChanged";
        applier[eventName].addListener(path, 
            function() {
                if (!applier.hasChangeSource(source)) {
                    func.apply(null, arguments);
                }
            }, namespace);
    };

    /** Convenience method to fire a change event to a specified applier, including
     * a supplied "source" identified (perhaps for use with addSourceGuardedListener)
     */ 
    fluid.fireSourcedChange = function (applier, path, value, source) {
        applier.fireChangeRequest({
            path: path,
            value: value,
            source: source
        });         
    };
    
    /** Dispatches a list of changes to the supplied applier */
    fluid.requestChanges = function (applier, changes) {
        for (var i = 0; i < changes.length; ++i) {
            applier.fireChangeRequest(changes[i]);
        }  
    };
    
  
    // Automatically adapts requestChange onto fireChangeRequest
    // unsupported, NON-API function    
    fluid.bindRequestChange = function (that) {
        that.requestChange = function (path, value, type) {
            var changeRequest = {
                path: path,
                value: value,
                type: type
            };
            that.fireChangeRequest(changeRequest);
        };
    };
    
    // Utility used for source tracking in changeApplier
    
    function sourceWrapModelChanged(modelChanged, threadLocal) {
        return function (changeRequest) {
            var sources = threadLocal().sources;
            var args = arguments;
            var source = changeRequest.source || "";
            fluid.tryCatch(function () {
                if (sources[source] === undefined) {
                    sources[source] = 0;
                }
                ++sources[source];
                modelChanged.apply(null, args);
            }, null, function() {
                --sources[source];
            });
        };
    }
  
    /** The core creator function constructing ChangeAppliers. See API documentation
     * at http://wiki.fluidproject.org/display/fluid/ChangeApplier+API for the various
     * options supported in the options structure */
     
    fluid.makeChangeApplier = function (model, options) {
        options = options || {};
        var baseEvents = {
            guards: fluid.event.getEventFirer(false, true, "guard event"),
            postGuards: fluid.event.getEventFirer(false, true, "postGuard event"),
            modelChanged: fluid.event.getEventFirer(false, false, "modelChanged event")
        };
        var threadLocal = fluid.threadLocal(function() { return {sources: {}};});
        var that = {
        // For now, we don't use "id" to avoid confusing component detection which uses
        // a simple algorithm looking for that field
            changeid: fluid.allocateGuid(),
            model: model
        };
        
        function makeGuardWrapper(cullUnchanged) {
            if (!cullUnchanged) {
                return null;
            }
            var togo = function (guard) {
                return function (model, changeRequest, internalApplier) {
                    var oldRet = guard(model, changeRequest, internalApplier);
                    if (oldRet === false) {
                        return false;
                    }
                    else {
                        if (fluid.model.isNullChange(model, changeRequest)) {
                            togo.culled = true;
                            return false;
                        }
                    }
                };
            };
            return togo;
        }

        function wrapListener(listener, spec) {
            var pathSpec = spec;
            var transactional = false;
            var priority = Number.MAX_VALUE;
            if (typeof (spec) !== "string") {
                pathSpec = spec.path;
                transactional = spec.transactional;
                if (spec.priority !== undefined) {
                    priority = spec.priority;
                }
            }
            else {
                if (pathSpec.charAt(0) === "!") {
                    transactional = true;
                    pathSpec = pathSpec.substring(1);
                }
            }
            var wrapped = function (changePath, fireSpec, accum) {
                var guid = fluid.event.identifyListener(listener);
                var exist = fireSpec.guids[guid];
                if (!exist) {
                    var match = fluid.pathUtil.matchPath(pathSpec, changePath);
                    if (match !== null) {
                        var record = {
                            changePath: changePath,
                            pathSpec: pathSpec,
                            listener: listener,
                            priority: priority,
                            transactional: transactional
                        };
                        if (accum) {
                            record.accumulate = [accum];
                        }
                        fireSpec.guids[guid] = record;
                        var collection = transactional ? "transListeners" : "listeners";
                        fireSpec[collection].push(record);
                        fireSpec.all.push(record);
                    }
                }
                else if (accum) {
                    if (!exist.accumulate) {
                        exist.accumulate = [];
                    }
                    exist.accumulate.push(accum);
                }
            };
            fluid.event.impersonateListener(listener, wrapped);
            return wrapped;
        }
        
        function fireFromSpec(name, fireSpec, args, category, wrapper) {
            return baseEvents[name].fireToListeners(fireSpec[category], args, wrapper);
        }
        
        function fireComparator(recA, recB) {
            return recA.priority - recB.priority;
        }

        function prepareFireEvent(name, changePath, fireSpec, accum) {
            baseEvents[name].fire(changePath, fireSpec, accum);
            fireSpec.all.sort(fireComparator);
            fireSpec.listeners.sort(fireComparator);
            fireSpec.transListeners.sort(fireComparator);
        }
        
        function makeFireSpec() {
            return {guids: {}, all: [], listeners: [], transListeners: []};
        }
        
        function getFireSpec(name, changePath) {
            var fireSpec = makeFireSpec();
            prepareFireEvent(name, changePath, fireSpec);
            return fireSpec;
        }
        
        function fireEvent(name, changePath, args, wrapper) {
            var fireSpec = getFireSpec(name, changePath);
            return fireFromSpec(name, fireSpec, args, "all", wrapper);
        }
        
        function adaptListener(that, name) {
            that[name] = {
                addListener: function (spec, listener, namespace) {
                    baseEvents[name].addListener(wrapListener(listener, spec), namespace);
                },
                removeListener: function (listener) {
                    baseEvents[name].removeListener(listener);
                }
            };
        }
        adaptListener(that, "guards");
        adaptListener(that, "postGuards");
        adaptListener(that, "modelChanged");
        
        function preFireChangeRequest(changeRequest) {
            if (!changeRequest.type) {
                changeRequest.type = "ADD";
            }
        }

        var bareApplier = {
            fireChangeRequest: function (changeRequest) {
                that.fireChangeRequest(changeRequest, true);
            }
        };
        fluid.bindRequestChange(bareApplier);

        that.fireChangeRequest = function (changeRequest, defeatGuards) {
            preFireChangeRequest(changeRequest);
            var guardFireSpec = defeatGuards ? null : getFireSpec("guards", changeRequest.path);
            if (guardFireSpec && guardFireSpec.transListeners.length > 0) {
                var ation = that.initiate();
                ation.fireChangeRequest(changeRequest, guardFireSpec);
                ation.commit();
            }
            else {
                if (!defeatGuards) {
                    // TODO: this use of "listeners" seems pointless since we have just verified that there are no transactional listeners
                    var prevent = fireFromSpec("guards", guardFireSpec, [model, changeRequest, bareApplier], "listeners");
                    if (prevent === false) {
                        return false;
                    }
                }
                var oldModel = model;
                if (!options.thin) {
                    oldModel = {};
                    fluid.model.copyModel(oldModel, model);                    
                }
                fluid.model.applyChangeRequest(model, changeRequest, options.resolverSetConfig);
                fireEvent("modelChanged", changeRequest.path, [model, oldModel, [changeRequest]]);
            }
        };
        
        that.fireChangeRequest = sourceWrapModelChanged(that.fireChangeRequest, threadLocal);
        fluid.bindRequestChange(that);

        function fireAgglomerated(eventName, formName, changes, args, accpos) {
            var fireSpec = makeFireSpec();
            for (var i = 0; i < changes.length; ++i) {
                prepareFireEvent(eventName, changes[i].path, fireSpec, changes[i]);
            }
            for (var j = 0; j < fireSpec[formName].length; ++j) {
                var spec = fireSpec[formName][j];
                if (accpos) {
                    args[accpos] = spec.accumulate;
                }
                var ret = spec.listener.apply(null, args);
                if (ret === false) {
                    return false;
                }
            }
        }

        that.initiate = function (newModel) {
            var cancelled = false;
            var changes = [];
            if (options.thin) {
                newModel = model;
            }
            else {
                newModel = newModel || {};
                fluid.model.copyModel(newModel, model);
            }
            // the guard in the inner world is given a private applier to "fast track"
            // and glob collateral changes it requires
            var internalApplier = {
                fireChangeRequest: function (changeRequest) {
                    preFireChangeRequest(changeRequest);
                    fluid.model.applyChangeRequest(newModel, changeRequest, options.resolverSetConfig);
                    changes.push(changeRequest);
                }
            };
            fluid.bindRequestChange(internalApplier);
            var ation = {
                commit: function () {
                    var oldModel;
                    if (cancelled) {
                        return false;
                    }
                    var ret = fireAgglomerated("postGuards", "transListeners", changes, [newModel, null, internalApplier], 1);
                    if (ret === false) {
                        return false;
                    }
                    if (options.thin) {
                        oldModel = model;
                    }
                    else {
                        oldModel = {};
                        fluid.model.copyModel(oldModel, model);
                        fluid.clear(model);
                        fluid.model.copyModel(model, newModel);
                    }
                    fireAgglomerated("modelChanged", "all", changes, [model, oldModel, null], 2);
                },
                fireChangeRequest: function (changeRequest) {
                    preFireChangeRequest(changeRequest);
                    if (options.cullUnchanged && fluid.model.isNullChange(model, changeRequest, options.resolverGetConfig)) {
                        return;
                    } 
                    var wrapper = makeGuardWrapper(options.cullUnchanged);
                    var prevent = fireEvent("guards", changeRequest.path, [newModel, changeRequest, internalApplier], wrapper);
                    if (prevent === false && !(wrapper && wrapper.culled)) {
                        cancelled = true;
                    }
                    if (!cancelled) {
                        if (!(wrapper && wrapper.culled)) {
                            fluid.model.applyChangeRequest(newModel, changeRequest, options.resolverSetConfig);
                            changes.push(changeRequest);
                        }
                    }
                }
            };
            
            ation.fireChangeRequest = sourceWrapModelChanged(ation.fireChangeRequest, threadLocal);
            fluid.bindRequestChange(ation);

            return ation;
        };
        
        that.hasChangeSource = function (source) {
            return threadLocal().sources[source] > 0;
        };
        
        return that;
    };
    
    fluid.makeSuperApplier = function () {
        var subAppliers = [];
        var that = {};
        that.addSubApplier = function (path, subApplier) {
            subAppliers.push({path: path, subApplier: subApplier});
        };
        that.fireChangeRequest = function (request) {
            for (var i = 0; i < subAppliers.length; ++i) {
                var path = subAppliers[i].path;
                if (request.path.indexOf(path) === 0) {
                    var subpath = request.path.substring(path.length + 1);
                    var subRequest = fluid.copy(request);
                    subRequest.path = subpath;
                    // TODO: Deal with the as yet unsupported case of an EL rvalue DAR
                    subAppliers[i].subApplier.fireChangeRequest(subRequest);
                }
            }
        };
        fluid.bindRequestChange(that);
        return that;
    };
    
    fluid.attachModel = function (baseModel, path, model) {
        var segs = fluid.model.parseEL(path);
        for (var i = 0; i < segs.length - 1; ++i) {
            var seg = segs[i];
            var subModel = baseModel[seg];
            if (!subModel) {
                baseModel[seg] = subModel = {};
            }
            baseModel = subModel;
        }
        baseModel[segs[segs.length - 1]] = model;
    };
    
    fluid.assembleModel = function (modelSpec) {
        var model = {};
        var superApplier = fluid.makeSuperApplier();
        var togo = {model: model, applier: superApplier};
        for (var path in modelSpec) {
            var rec = modelSpec[path];
            fluid.attachModel(model, path, rec.model);
            if (rec.applier) {
                superApplier.addSubApplier(path, rec.applier);
            }
        }
        return togo;
    };

})(jQuery, fluid_1_5);
/*
Copyright 2010 University of Toronto
Copyright 2010-2011 OCAD University

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global fluid:true, fluid_1_5:true, jQuery*/

// JSLint options 
/*jslint white: true, elsecatch: true, jslintok: true, funcinvoke: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

var fluid_1_5 = fluid_1_5 || {};
var fluid = fluid || fluid_1_5;

(function ($) {

    fluid.registerNamespace("fluid.model.transform");
    
    /** Grade definitions for standard transformation function hierarchy **/
    
    fluid.defaults("fluid.transformFunction", {
        gradeNames: "fluid.function"
    });
    
    // uses standard layout and workflow involving inputPath
    fluid.defaults("fluid.standardInputTransformFunction", {
        gradeNames: "fluid.transformFunction"  
    });
    
    fluid.defaults("fluid.standardOutputTransformFunction", {
        gradeNames: "fluid.transformFunction"  
    });

    fluid.defaults("fluid.multiInputTransformFunction", {
        gradeNames: "fluid.transformFunction"
    });
    
    // uses the standard layout and workflow involving inputPath and outputPath
    fluid.defaults("fluid.standardTransformFunction", {
        gradeNames: ["fluid.standardInputTransformFunction", "fluid.standardOutputTransformFunction"]  
    });
    
    fluid.defaults("fluid.lens", {
        gradeNames: "fluid.transformFunction",
        invertConfiguration: null
        // this function method returns "inverted configuration" rather than actually performing inversion
        // TODO: harmonise with strategy used in VideoPlayer_framework.js
    });
    
    /***********************************
     * Base utilities for transformers *
     ***********************************/

    // unsupported, NON-API function
    fluid.model.transform.pathToRule = function (inputPath) {
        return {
            expander: {
                type: "fluid.model.transform.value",
                inputPath: inputPath
            }
        };
    };
    
    // unsupported, NON-API function    
    fluid.model.transform.valueToRule = function (value) {
        return {
            expander: {
                type: "fluid.model.transform.literalValue",
                value: value
            }
        };
    };
        
    /** Accepts two fully escaped paths, either of which may be empty or null **/
    fluid.model.composePaths = function (prefix, suffix) {
        prefix = prefix || "";
        suffix = suffix || "";
        return !prefix ? suffix : (!suffix ? prefix : prefix + "." + suffix);
    };

    fluid.model.transform.accumulateInputPath = function (inputPath, expander, paths) {
        if (inputPath !== undefined) {
            paths.push(fluid.model.composePaths(expander.inputPrefix, inputPath));
        }
    };

    fluid.model.transform.accumulateStandardInputPath = function (input, expandSpec, expander, paths) {
        fluid.model.transform.getValue(undefined, expandSpec[input], expander);    
        fluid.model.transform.accumulateInputPath(expandSpec[input + "Path"], expander, paths);
    };

    fluid.model.transform.accumulateMultiInputPaths = function (inputVariables, expandSpec, expander, paths) {
        fluid.each(inputVariables, function (v, k) {
            fluid.model.transform.accumulateStandardInputPath(k, expandSpec, expander, paths);
        });
    };

    fluid.model.transform.getValue = function (inputPath, value, expander) {
        var togo;
        if (inputPath !== undefined) { // NB: We may one day want to reverse the crazy jQuery-like convention that "no path means root path"
            togo = fluid.get(expander.source, fluid.model.composePaths(expander.inputPrefix, inputPath), expander.resolverGetConfig);
        }
        if (togo === undefined) {
            togo = fluid.isPrimitive(value) ? value : expander.expand(value);
        }
        return togo;
    };
    
    // distinguished value which indicates that a transformation rule supplied a 
    // non-default output path, and so the user should be prevented from making use of it
    // in a compound expander definition
    fluid.model.transform.NONDEFAULT_OUTPUT_PATH_RETURN = {};
    
    fluid.model.transform.setValue = function (userOutputPath, value, expander, merge) {
        // avoid crosslinking to input object - this might be controlled by a "nocopy" option in future
        var toset = fluid.copy(value); 
        var outputPath = fluid.model.composePaths(expander.outputPrefix, userOutputPath);
        // TODO: custom resolver config here to create non-hash output model structure
        if (toset !== undefined) {
            expander.applier.requestChange(outputPath, toset, merge ? "MERGE" : undefined);
        }
        return userOutputPath ? fluid.model.transform.NONDEFAULT_OUTPUT_PATH_RETURN : toset;
    };
    
    /* Resolves the <key> given as parameter by looking up the path <key>Path in the object
     * to be transformed. If not present, it resolves the <key> by using the literal value if primitive,
     * or expanding otherwise. <def> defines the default value if unableto resolve the key. If no
     * default value is given undefined is returned
     */
    fluid.model.transform.resolveParam = function (expandSpec, expander, key, def) {
        var val = fluid.model.transform.getValue(expandSpec[key + "Path"], expandSpec[key], expander);
        return (val !== undefined) ? val : def;
    };

    // TODO: Incomplete implementation which only checks expected paths
    fluid.deepEquals = function (expected, actual, stats) {
        if (fluid.isPrimitive(expected)) {
            if (expected === actual) {
                ++stats.matchCount;
            } else {
                ++stats.mismatchCount;
                stats.messages.push("Value mismatch at path " + stats.path + ": expected " + expected + " actual " + actual);
            }
        }
        else {
            if (typeof(expected) !== typeof(actual)) {
                ++stats.mismatchCount;
                stats.messages.push("Type mismatch at path " + stats.path + ": expected " + typeof(expected)  + " actual " + typeof(actual)); 
            } else {
                fluid.each(expected, function (value, key) {
                    stats.pathOps.push(key);
                    fluid.deepEquals(expected[key], actual[key], stats);
                    stats.pathOps.pop(key);
                });
            }
        }
    };
    
    fluid.model.transform.matchValue = function (expected, actual) {
        if (fluid.isPrimitive(expected)) {
            return expected === actual ? 1 : 0;
        } else {
            var stats = {
                matchCount: 0,
                mismatchCount: 0,
                messages: []
            };
            fluid.model.makePathStack(stats, "path");
            fluid.deepEquals(expected, actual, stats);
            return stats.matchCount;
        }
    };
    
    // unsupported, NON-API function    
    fluid.model.transform.compareMatches = function (speca, specb) {
        return specb.matchCount - speca.matchCount;
    };
    
    fluid.firstDefined = function (a, b) {
        return a === undefined ? b : a;
    };

        
    // TODO: prefixApplier is an expander which is currently unused and untested
    fluid.model.transform.prefixApplier = function (expandSpec, expander) {
        if (expandSpec.inputPrefix) {
            expander.inputPrefixOp.push(expandSpec.inputPrefix);
        }
        if (expandSpec.outputPrefix) {
            expander.outputPrefixOp.push(expandSpec.outputPrefix);
        }
        expander.expand(expandSpec.value);
        if (expandSpec.inputPrefix) {
            expander.inputPrefixOp.pop();
        }
        if (expandSpec.outputPrefix) {
            expander.outputPrefixOp.pop();
        }
    };
    
    fluid.defaults("fluid.model.transform.prefixApplier", {
        gradeNames: ["fluid.transformFunction"]
    });
    
    // unsupported, NON-API function
    fluid.model.makePathStack = function (expander, prefixName) {
        var stack = expander[prefixName + "Stack"] = [];
        expander[prefixName] = "";
        return {
            push: function (prefix) {
                var newPath = fluid.model.composePaths(expander[prefixName], prefix);
                stack.push(expander[prefixName]);
                expander[prefixName] = newPath;
            },
            pop: function () {
                expander[prefixName] = stack.pop();
            }
        };
    };
    
    // unsupported, NON-API function
    fluid.model.transform.expandExpander = function (expandSpec, expander) {
        var typeName = expandSpec.type;
        if (!typeName) {
            fluid.fail("Transformation record is missing a type name: ", expandSpec);
        }
        if (typeName.indexOf(".") === -1) {
            typeName = "fluid.model.transform." + typeName;
        }
        var expanderFn = fluid.getGlobalValue(typeName);
        var expdef = fluid.defaults(typeName);
        if (typeof(expanderFn) !== "function") {
            fluid.fail("Transformation record specifies transformation function with name " + 
                expandSpec.type + " which is not a function - ", expanderFn);
        }
        if (!fluid.hasGrade(expdef, "fluid.transformFunction")) {
            // If no suitable grade is set up, assume that it is intended to be used as a standardTransformFunction
            expdef = fluid.defaults("fluid.standardTransformFunction");
        }
        var expanderArgs = [expandSpec, expander];
        if (fluid.hasGrade(expdef, "fluid.standardInputTransformFunction")) {
            if (expandSpec.input !== undefined) { 
                expandSpec.value = expandSpec.input; // alias input and value
            }
            var expanded = fluid.model.transform.getValue(expandSpec.inputPath, expandSpec.value, expander);
            expanderArgs.unshift(expanded);
        } else if (fluid.hasGrade(expdef, "fluid.multiInputTransformFunction")) {
            var inputs = {};
            fluid.each(expdef.inputVariables, function (v, k) {
                var input = fluid.model.transform.getValue(expandSpec[k + "Path"], expandSpec[k], expander);
                inputs[k] = (input !== undefined) ? input : v; // if no match, assign default
            });
            expanderArgs.unshift(inputs);
        }
        var transformed = expanderFn.apply(null, expanderArgs);
        if (fluid.hasGrade(expdef, "fluid.standardOutputTransformFunction")) {
            transformed = fluid.model.transform.setValue(expandSpec.outputPath, transformed, expander, expandSpec.merge);
        }
        return transformed;
    };
    
    // unsupported, NON-API function    
    fluid.model.transform.expandWildcards = function (expander, source) {
        fluid.each(source, function (value, key) {
            var q = expander.queuedExpanders;
            expander.pathOp.push(fluid.pathUtil.escapeSegment(key.toString()));
            for (var i = 0; i < q.length; ++i) {
                if (fluid.pathUtil.matchPath(q[i].matchPath, expander.path, true)) {
                    var esCopy = fluid.copy(q[i].expandSpec);
                    if (esCopy.inputPath === undefined || fluid.model.transform.hasWildcard(esCopy.inputPath)) {
                        esCopy.inputPath = "";
                    }
                    // TODO: allow some kind of interpolation for output path
                    expander.inputPrefixOp.push(expander.path);
                    expander.outputPrefixOp.push(expander.path);
                    fluid.model.transform.expandExpander(esCopy, expander);
                    expander.outputPrefixOp.pop();
                    expander.inputPrefixOp.pop();
                }
            }
            if (!fluid.isPrimitive(value)) {
                fluid.model.transform.expandWildcards(expander, value);
            }
            expander.pathOp.pop();
        });
    };
    
    // unsupported, NON-API function   
    fluid.model.transform.hasWildcard = function (path) {
        return typeof(path) === "string" && path.indexOf("*") !== -1;
    };
    
    // unsupported, NON-API function
    fluid.model.transform.maybePushWildcard = function (expandSpec, expander) {
        var hw = fluid.model.transform.hasWildcard;
        var matchPath;
        if (hw(expandSpec.inputPath)) {
            matchPath = fluid.model.composePaths(expander.inputPrefix, expandSpec.inputPath);
        }
        else if (hw(expander.outputPrefix) || hw(expandSpec.outputPath)) {
            matchPath = fluid.model.composePaths(expander.outputPrefix, expandSpec.outputPath);
        }
                         
        if (matchPath) {
            expander.queuedExpanders.push({expandSpec: expandSpec, outputPrefix: expander.outputPrefix, inputPrefix: expander.inputPrefix, matchPath: matchPath});
            return true;
        }
        return false;
    };
    
    fluid.model.sortByKeyLength = function (inObject) {
        var keys = fluid.keys(inObject);
        return keys.sort(fluid.compareStringLength(true));
    };
    
    // Three handler functions operating the (currently) three different processing modes
    // unsupported, NON-API function
    fluid.model.transform.handleExpandExpander = function (expandSpec, expander) {
        if (fluid.model.transform.maybePushWildcard(expandSpec, expander)) {
            return;
        }
        else {
            return fluid.model.transform.expandExpander(expandSpec, expander);
        }
    };
    // unsupported, NON-API function
    fluid.model.transform.handleInvertExpander = function (expandSpec, expander, expdef) {
        var invertor = expdef.invertConfiguration;
        if (invertor) {
            var inverted = fluid.invokeGlobalFunction(invertor, [expandSpec, expander]);
            expander.inverted.push(inverted);
        }
    };
    
    // unsupported, NON-API function
    fluid.model.transform.handlerCollectExpander = function (expandSpec, expander, expdef) {
        var standardInput = fluid.hasGrade(expdef, "fluid.standardInputTransformFunction");
        var multiInput = fluid.hasGrade(expdef, "fluid.multiInputTransformFunction");

        if (standardInput) {
            fluid.model.transform.accumulateStandardInputPath("input", expandSpec, expander, expander.inputPaths);
        } else if (multiInput) {
            fluid.model.transform.accumulateMultiInputPaths(expdef.inputVariables, expandSpec, expander, expander.inputPaths);
        } else {
            var collector = expdef.collectInputPaths;
            if (collector) {
                var collected = fluid.makeArray(fluid.invokeGlobalFunction(collector, [expandSpec, expander]));
                expander.inputPaths = expander.inputPaths.concat(collected);
            }
        }
    };
    
    // unsupported, NON-API function
    fluid.model.transform.expandValue = function (rule, expander) {
        if (typeof(rule) === "string") {
            rule = fluid.model.transform.pathToRule(rule);
        }
        // special dispensation to allow "value" at top level
        // TODO: Proper escaping rules
        else if (rule.value && expander.outputPrefix !== "") {
            rule = fluid.model.transform.valueToRule(rule.value);
        }
        var togo;
        if (rule.expander) {
            var expanders = fluid.makeArray(rule.expander);
            for (var i = 0; i < expanders.length; ++i) {
                var expandSpec = expanders[i];
                var expdef = fluid.defaults(expandSpec.type);
                var returned = expander.expanderHandler(expandSpec, expander, expdef);
                if (returned !== undefined) {
                    togo = returned;
                }
            }
        }
        fluid.each(rule, function (value, key) {
            if (key !== "expander") {
                expander.outputPrefixOp.push(key);
                // TODO: Note that result by convention is discarded otherwise value expanders will cascade in a faulty way 
                var result = expander.expand(value, expander); 
                expander.outputPrefixOp.pop();
            }
        });
        return togo;
    };
    
    // unsupported, NON-API function
    fluid.model.transform.makeExpander = function (expander, handleFn, expandFn) {
        expandFn = expandFn || fluid.model.transform.expandValue;
        expander.expand = function (rules) {
            return expandFn(rules, expander);
        };
        expander.outputPrefixOp = fluid.model.makePathStack(expander, "outputPrefix");
        expander.inputPrefixOp = fluid.model.makePathStack(expander, "inputPrefix");
        expander.expanderHandler = handleFn;
    };
    
    fluid.model.transform.invertConfiguration = function (rules) {
        var expander = {
            inverted: []
        };
        fluid.model.transform.makeExpander(expander, fluid.model.transform.handleInvertExpander);
        expander.expand(rules);
        return {
            expander: expander.inverted
        };
    };
    
    fluid.model.transform.collectInputPaths = function (rules) {
        var expander = {
            inputPaths: []
        };
        fluid.model.transform.makeExpander(expander, fluid.model.transform.handlerCollectExpander);
        expander.expand(rules);
        return expander.inputPaths;        
    };
    
    // unsupported, NON-API function
    fluid.model.transform.flatSchemaStrategy = function (flatSchema) {
        var keys = fluid.model.sortByKeyLength(flatSchema);
        return function (root, segment, index, segs) {
            var path = fluid.path.apply(null, segs.slice(0, index));
          // TODO: clearly this implementation could be much more efficient
            for (var i = 0; i < keys.length; ++i) {
                var key = keys[i];
                if (fluid.pathUtil.matchPath(key, path, true) !== null) {
                    return flatSchema[key];
                }
            }
        };
    };
    
    // unsupported, NON-API function
    fluid.model.transform.defaultSchemaValue = function (schemaValue) {
        var type = fluid.isPrimitive(schemaValue) ? schemaValue : schemaValue.type;
        return type === "array" ? [] : {};
    };
    
    // unsupported, NON-API function
    fluid.model.transform.isomorphicSchemaStrategy = function (source, getConfig) { 
        return function (root, segment, index, segs) {
            var existing = fluid.get(source, segs.slice(0, index), getConfig);
            return fluid.isArrayable(existing) ? "array" : "object";
        };
    };
    
    // unsupported, NON-API function
    fluid.model.transform.decodeStrategy = function (source, options, getConfig) {
        if (options.isomorphic) {
            return fluid.model.transform.isomorphicSchemaStrategy(source, getConfig);
        }
        else if (options.flatSchema) {
            return fluid.model.transform.flatSchemaStrategy(options.flatSchema, getConfig);
        }
    };
    
    // unsupported, NON-API function
    fluid.model.transform.schemaToCreatorStrategy = function (strategy) {
        return function (root, segment, index, segs) {
            if (root[segment] === undefined) {
                var schemaValue = strategy(root, segment, index, segs); 
                return root[segment] = fluid.model.transform.defaultSchemaValue(schemaValue);
            }
        };  
    };
    
    /** Transforms a model by a sequence of rules. Parameters as for fluid.model.transform,
     * only with an array accepted for "rules"
     */
    fluid.model.transform.sequence = function (source, rules, options) {
        for (var i = 0; i < rules.length; ++i) {
            source = fluid.model.transform(source, rules[i], options);
        }
        return source;
    };
    
    fluid.model.compareByPathLength = function (changea, changeb) {
        var pdiff = changea.path.length - changeb.path.length; 
        return pdiff === 0 ? changea.sequence - changeb.sequence : pdiff;
    };
    
   /** Fires an accumulated set of change requests in increasing order of target pathlength
     */
    fluid.model.fireSortedChanges = function (changes, applier) {
        changes.sort(fluid.model.compareByPathLength);
        fluid.requestChanges(applier, changes);  
    };
    
    /**
     * Transforms a model based on a specified expansion rules objects.
     * Rules objects take the form of:
     *   {
     *       "target.path": "value.el.path" || {
     *          expander: {
     *              type: "expander.function.path",
     *               ...
     *           }
     *       }
     *   }
     *
     * @param {Object} source the model to transform
     * @param {Object} rules a rules object containing instructions on how to transform the model
     * @param {Object} options a set of rules governing the transformations. At present this may contain
     * the values <code>isomorphic: true</code> indicating that the output model is to be governed by the
     * same schema found in the input model, or <code>flatSchema</code> holding a flat schema object which 
     * consists of a hash of EL path specifications with wildcards, to the values "array"/"object" defining
     * the schema to be used to construct missing trunk values.
     */
    fluid.model.transformWithRules = function (source, rules, options) {
        options = options || {};
        
        var getConfig = fluid.model.escapedGetConfig;
        
        var schemaStrategy = fluid.model.transform.decodeStrategy(source, options, getConfig);
        var setConfig = fluid.copy(fluid.model.escapedSetConfig);
        setConfig.strategies = [fluid.model.defaultFetchStrategy, schemaStrategy ? fluid.model.transform.schemaToCreatorStrategy(schemaStrategy)
                : fluid.model.defaultCreatorStrategy];

        var expander = {
            source: source,
            target: schemaStrategy ? fluid.model.transform.defaultSchemaValue(schemaStrategy(null, "", 0, [""])) : {},
            resolverGetConfig: getConfig,
            queuedChanges: [],
            queuedExpanders: [] // TODO: This is used only by wildcard applier - explain its operation
        };
        fluid.model.transform.makeExpander(expander, fluid.model.transform.handleExpandExpander);
        expander.applier = {
            fireChangeRequest: function (changeRequest) {
                changeRequest.sequence = expander.queuedChanges.length;
                expander.queuedChanges.push(changeRequest);
            }
        };
        fluid.bindRequestChange(expander.applier);
        expander.finalApplier = fluid.makeChangeApplier(expander.target, {resolverSetConfig: setConfig});
        
        expander.expand(rules);
        if (expander.queuedExpanders.length > 0) {
            expander.typeStack = [];
            expander.pathOp = fluid.model.makePathStack(expander, "path");
            fluid.model.transform.expandWildcards(expander, source);
        }
        fluid.model.fireSortedChanges(expander.queuedChanges, expander.finalApplier);
        return expander.target;    
    };
    
    $.extend(fluid.model.transformWithRules, fluid.model.transform);
    fluid.model.transform = fluid.model.transformWithRules;

    /** Utility function to produce a standard options transformation record for a single set of rules **/    
    fluid.transformOne = function (rules) {
        return {
            transformOptions: {
                transformer: "fluid.model.transformWithRules",
                config: rules
            }
        };
    };
    
    /** Utility function to produce a standard options transformation record for multiple rules to be applied in sequence **/    
    fluid.transformMany = function (rules) {
        return {
            transformOptions: {
                transformer: "fluid.model.transform.sequence",
                config: rules
            }
        };
    };
    
})(jQuery, fluid_1_5);
/*
Copyright 2010 University of Toronto
Copyright 2010-2011 OCAD University
Copyright 2013 Raising the Floor - International

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global fluid:true, fluid_1_5:true, jQuery*/

// JSLint options 
/*jslint white: true, elsecatch: true, jslintok: true, funcinvoke: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

var fluid_1_5 = fluid_1_5 || {};
var fluid = fluid || fluid_1_5;

(function ($) {
    fluid.registerNamespace("fluid.model.transform");
    /**********************************
     * Standard transformer functions *
     **********************************/
        
    fluid.defaults("fluid.model.transform.value", { 
        gradeNames: "fluid.standardTransformFunction",
        invertConfiguration: "fluid.model.transform.invertValue"
    });

    fluid.model.transform.value = fluid.identity;
    
    fluid.model.transform.invertValue = function (expandSpec, expander) {
        var togo = fluid.copy(expandSpec);
        // TODO: this will not behave correctly in the face of compound "value" which contains
        // further expanders
        togo.inputPath = fluid.model.composePaths(expander.outputPrefix, expandSpec.outputPath);
        togo.outputPath = fluid.model.composePaths(expander.inputPrefix, expandSpec.inputPath);
        return togo;
    };


    fluid.defaults("fluid.model.transform.literalValue", { 
        gradeNames: "fluid.standardOutputTransformFunction"
    });

    fluid.model.transform.literalValue = function (expanderSpec) {
        return expanderSpec.value;  
    };
    

    fluid.defaults("fluid.model.transform.arrayValue", { 
        gradeNames: "fluid.standardTransformFunction"
    });
    
    fluid.model.transform.arrayValue = fluid.makeArray;


    fluid.defaults("fluid.model.transform.count", { 
        gradeNames: "fluid.standardTransformFunction"
    });
    
    fluid.model.transform.count = function (value) {
        return fluid.makeArray(value).length;
    };
    
    
    fluid.defaults("fluid.model.transform.round", { 
        gradeNames: "fluid.standardTransformFunction"
    });
    
    fluid.model.transform.round = function (value) {
        return Math.round(value);
    };
    

    fluid.defaults("fluid.model.transform.delete", { 
        gradeNames: "fluid.transformFunction"
    });

    fluid.model.transform["delete"] = function (expandSpec, expander) {
        var outputPath = fluid.model.composePaths(expander.outputPrefix, expandSpec.outputPath);
        expander.applier.requestChange(outputPath, null, "DELETE");
    };

    
    fluid.defaults("fluid.model.transform.firstValue", { 
        gradeNames: "fluid.transformFunction"
    });
    
    fluid.model.transform.firstValue = function (expandSpec, expander) {
        if (!expandSpec.values || !expandSpec.values.length) {
            fluid.fail("firstValue transformer requires an array of values at path named \"values\", supplied", expandSpec);
        }
        for (var i = 0; i < expandSpec.values.length; i++) {
            var value = expandSpec.values[i];
            // TODO: problem here - all of these expanders will have their side-effects (setValue) even if only one is chosen 
            var expanded = expander.expand(value);
            if (expanded !== undefined) {
                return expanded;
            }
        }
    };
    
     
    fluid.defaults("fluid.model.transform.scaleValue", {
        gradeNames: [ "fluid.multiInputTransformFunction", "fluid.standardOutputTransformFunction" ],
        inputVariables: { 
            value: null, 
            factor: 1,
            offset: 0
        }
    });

    /* simple linear transformation */
    fluid.model.transform.scaleValue = function (inputs, expandSpec, expander) {        
        if (typeof(inputs.value) !== "number" || typeof(inputs.factor) !== "number" || typeof(inputs.offset) !== "number") {
            return undefined;
        }
        return inputs.value * inputs.factor + inputs.offset;
    };


    fluid.defaults("fluid.model.transform.binaryOp", { 
        gradeNames: [ "fluid.multiInputTransformFunction", "fluid.standardOutputTransformFunction" ],
        inputVariables: {
            left: null,
            right: null
        }
    });
    
    fluid.model.transform.binaryLookup = {
        "===": function (a, b) { return a === b; },
        "!==": function (a, b) { return a !== b; },
        "<=": function (a, b) { return a <= b; },
        "<": function (a, b) { return a < b; },
        ">=": function (a, b) { return a >= b; },
        ">": function (a, b) { return a > b; },
        "+": function (a, b) { return a + b; },
        "-": function (a, b) { return a - b; },
        "*": function (a, b) { return a * b; },
        "/": function (a, b) { return a / b; },
        "%": function (a, b) { return a % b; },
        "&&": function (a, b) { return a && b; },
        "||": function (a, b) { return a || b; }
    };

    fluid.model.transform.binaryOp = function (inputs, expandSpec, expander) {
        var operator = fluid.model.transform.getValue(undefined, expandSpec.operator, expander);

        var fun = fluid.model.transform.binaryLookup[operator];
        return (fun === undefined || inputs.left === null || inputs.right === null) ? undefined : fun(inputs.left, inputs.right);
    };


    fluid.defaults("fluid.model.transform.condition", { 
        gradeNames: [ "fluid.multiInputTransformFunction", "fluid.standardOutputTransformFunction" ],
        inputVariables: {
            "true": null,
            "false": null,
            "condition": null
        }
    });
    
    fluid.model.transform.condition = function (inputs, expandSpec, expander) {
        if (inputs.condition === null) {
            return undefined;
        }

        return inputs[inputs.condition];
    };


    fluid.defaults("fluid.model.transform.valueMapper", { 
        gradeNames: ["fluid.transformFunction", "fluid.lens"],
        invertConfiguration: "fluid.model.transform.valueMapper.invert",
        collectInputPaths: "fluid.model.transform.valueMapper.collect"
    });

    // unsupported, NON-API function    
    fluid.model.transform.matchValueMapperFull = function (outerValue, expandSpec, expander) {
        var o = expandSpec.options;
        if (o.length === 0) {
            fluid.fail("valueMapper supplied empty list of options: ", expandSpec);
        }
        if (o.length === 1) {
            return 0;
        }
        var matchPower = []; 
        for (var i = 0; i < o.length; ++i) {
            var option = o[i];
            var value = fluid.firstDefined(fluid.model.transform.getValue(option.inputPath, undefined, expander),
                outerValue);
            var matchCount = fluid.model.transform.matchValue(option.undefinedInputValue ? undefined : option.inputValue, value);
            matchPower[i] = {index: i, matchCount: matchCount};
        }
        matchPower.sort(fluid.model.transform.compareMatches);
        return matchPower[0].matchCount === matchPower[1].matchCount ? -1 : matchPower[0].index; 
    };

    fluid.model.transform.valueMapper = function (expandSpec, expander) {
        if (!expandSpec.options) {
            fluid.fail("demultiplexValue requires a list or hash of options at path named \"options\", supplied ", expandSpec);
        }
        var value = fluid.model.transform.getValue(expandSpec.inputPath, undefined, expander);
        var deref = fluid.isArrayable(expandSpec.options) ? // long form with list of records    
            function (testVal) {
                var index = fluid.model.transform.matchValueMapperFull(testVal, expandSpec, expander);
                return index === -1 ? null : expandSpec.options[index];
            } : 
            function (testVal) {
                return expandSpec.options[testVal];
            };
      
        var indexed = deref(value);
        if (!indexed) {
            // if no branch matches, try again using this value - WARNING, this seriously
            // threatens invertibility
            indexed = deref(expandSpec.defaultInputValue);
        }
        if (!indexed) {
            return;
        }

        var outputPath = indexed.outputPath === undefined ? expandSpec.defaultOutputPath : indexed.outputPath;
        expander.outputPrefixOp.push(outputPath);
        var outputValue;
        if (fluid.isPrimitive(indexed)) {
            outputValue = indexed;
        } else {
            // if undefinedOutputValue is set, outputValue should be undefined
            if (indexed.undefinedOutputValue) {
                outputValue = undefined;
            } else {
                // get value from outputValue or outputValuePath. If none is found set the outputValue to be that of defaultOutputValue (or undefined)
                outputValue = fluid.model.transform.resolveParam(indexed, expander, "outputValue", undefined);
                outputValue = (outputValue === undefined) ? expandSpec.defaultOutputValue : outputValue;
            }
        }
        var togo = fluid.model.transform.setValue(undefined, outputValue, expander, expandSpec.merge);
        expander.outputPrefixOp.pop();
        return togo; 
    };
    
    fluid.model.transform.valueMapper.invert = function (expandSpec, expander) {
        var options = [];
        var togo = {
            type: "fluid.model.transform.valueMapper",
            options: options
        };
        var isArray = fluid.isArrayable(expandSpec.options);
        var findCustom = function (name) {
            return fluid.find(expandSpec.options, function (option) {
                if (option[name]) {
                    return true;
                }
            });
        };
        var anyCustomOutput = findCustom("outputPath");
        var anyCustomInput = findCustom("inputPath");
        if (!anyCustomOutput) {
            togo.inputPath = fluid.model.composePaths(expander.outputPrefix, expandSpec.outputPath);
        }
        if (!anyCustomInput) {
            togo.defaultOutputPath = fluid.model.composePaths(expander.inputPrefix, expandSpec.inputPath);
        }
        var def = fluid.firstDefined;
        fluid.each(expandSpec.options, function (option, key) {
            var outOption = {};
            var origInputValue = def(isArray ? option.inputValue : key, expandSpec.defaultInputValue);
            if (origInputValue === undefined) {
                fluid.fail("Failure inverting configuration for valueMapper - inputValue could not be resolved for record " + key + ": ", expandSpec);
            }
            outOption.outputValue = origInputValue;
            var origOutputValue = def(option.outputValue, expandSpec.defaultOutputValue);
            outOption.inputValue = fluid.model.transform.getValue(option.outputValuePath, origOutputValue, expander);
            if (anyCustomOutput) {
                outOption.inputPath = fluid.model.composePaths(expander.outputPrefix, def(option.outputPath, expandSpec.outputPath));
            }
            if (anyCustomInput) {
                outOption.outputPath = fluid.model.composePaths(expander.inputPrefix, def(option.inputPath, expandSpec.inputPath));
            }
            if (option.outputValuePath) {
                outOption.inputValuePath = option.outputValuePath;
            }
            options.push(outOption);
        });
        return togo;
    };
    
    fluid.model.transform.valueMapper.collect = function (expandSpec, expander) {
        var togo = [];
        fluid.model.transform.accumulateInputPath(expandSpec.inputPath, expander, togo);
        fluid.each(expandSpec.options, function (option) {
            fluid.model.transform.accumulateInputPath(option.inputPath, expander, togo);
        });
        return togo;
    };

    /* -------- arrayToSetMembership and setMembershipToArray ---------------- */
    
    fluid.defaults("fluid.model.transform.arrayToSetMembership", { 
        gradeNames: ["fluid.standardInputTransformFunction", "fluid.lens"],
        invertConfiguration: "fluid.model.transform.arrayToSetMembership.invert"
    });

 
    fluid.model.transform.arrayToSetMembership = function (value, expandSpec, expander) {
        var options = expandSpec.options;

        if (!value || !fluid.isArrayable(value)) {
            fluid.fail("arrayToSetMembership didn't find array at inputPath nor passed as value.", expandSpec);
        }
        if (!options) {
            fluid.fail("arrayToSetMembership requires an options block set");
        }

        if (expandSpec.presentValue === undefined) {
            expandSpec.presentValue = true;
        }
        
        if (expandSpec.missingValue === undefined) {
            expandSpec.missingValue = false;
        }

        fluid.each(options, function (outPath, key) {
            // write to output path given in options the value <presentValue> or <missingValue> depending on whether key is found in user input
            var outVal = (value.indexOf(key) !== -1) ? expandSpec.presentValue : expandSpec.missingValue;
            fluid.model.transform.setValue(outPath, outVal, expander);
        });
        // TODO: Why does this transform make no return?
    };

    fluid.model.transform.arrayToSetMembership.invert = function (expandSpec, expander) {
        var togo = fluid.copy(expandSpec);
        delete togo.inputPath;
        togo.type = "fluid.model.transform.setMembershipToArray";
        togo.outputPath = fluid.model.composePaths(expander.inputPrefix, expandSpec.inputPath);
        var newOptions = {};
        fluid.each(expandSpec.options, function (path, oldKey) {
            var newKey = fluid.model.composePaths(expander.outputPrefix, path);
            newOptions[newKey] = oldKey;
        });
        togo.options = newOptions;
        return togo;
    };

    fluid.defaults("fluid.model.transform.setMembershipToArray", { 
        gradeNames: ["fluid.standardOutputTransformFunction"]
    });

    fluid.model.transform.setMembershipToArray = function (expandSpec, expander) {
        var options = expandSpec.options;

        if (!options) {
            fluid.fail("setMembershipToArray requires an options block specified");
        }

        if (expandSpec.presentValue === undefined) {
            expandSpec.presentValue = true;
        }
        
        if (expandSpec.missingValue === undefined) {
            expandSpec.missingValue = false;
        }

        var outputArr = [];
        fluid.each(options, function (arrVal, inPath) {
            var val = fluid.model.transform.getValue(inPath, undefined, expander);
            if (val === expandSpec.presentValue) {
                outputArr.push(arrVal);
            }
        });
        return outputArr;
    };    

    /* -------- objectToArray and arrayToObject -------------------- */
    
    /**
     * Transforms the given array to an object.
     * Uses the expandSpec.options.key values from each object within the array as new keys.
     *
     * For example, with expandSpec.key = "name" and an input object like this:
     *
     * {
     *   b: [
     *     { name: b1, v: v1 },
     *     { name: b2, v: v2 }
     *   ]
     * }
     *
     * The output will be:
     * {
     *   b: {
     *     b1: {
     *       v: v1
     *     }
     *   },
     *   {
     *     b2: {
     *       v: v2
     *     }
     *   }
     * }
     */
    fluid.model.transform.applyPaths = function (operation, pathOp, paths) {
        for (var i = 0; i < paths.length; ++i) {
            if (operation === "push") {
                pathOp.push(paths[i]);
            } else {
                pathOp.pop();   
            }
        }
    };
    
    fluid.model.transform.expandInnerValues = function (inputPath, outputPath, expander, innerValues) {
        var inputPrefixOp = expander.inputPrefixOp;
        var outputPrefixOp = expander.outputPrefixOp;
        var apply = fluid.model.transform.applyPaths;
        
        apply("push", inputPrefixOp, inputPath);
        apply("push", outputPrefixOp, outputPath);
        var expanded = {};
        fluid.each(innerValues, function (innerValue) {
            var expandedInner = expander.expand(innerValue);
            $.extend(true, expanded, expandedInner);
        });
        apply("pop", outputPrefixOp, outputPath);
        apply("pop", inputPrefixOp, inputPath);
        
        return expanded;
    };


    fluid.defaults("fluid.model.transform.arrayToObject", {
        gradeNames: ["fluid.standardTransformFunction", "fluid.lens" ],
        invertConfiguration: "fluid.model.transform.arrayToObject.invertRules"
    });

    fluid.model.transform.arrayToObject = function (arr, expandSpec, expander) {
        if (expandSpec.key === undefined) {
            fluid.fail("arrayToObject requires a 'key' option.", expandSpec);
        }
        if (!fluid.isArrayable(arr)) {
            fluid.fail("arrayToObject didn't find array at inputPath.", expandSpec);
        }
        var newHash = {};
        var pivot = expandSpec.key;

        fluid.each(arr, function (v, k) {
            // check that we have a pivot entry in the object and it's a valid type:            
            var newKey = v[pivot];
            var keyType = typeof(newKey);
            if (keyType !== "string" && keyType !== "boolean" && keyType !== "number") {
                fluid.fail("arrayToObject encountered untransformable array due to missing or invalid key", v);
            }
            // use the value of the key element as key and use the remaining content as value
            var content = fluid.copy(v);
            delete content[pivot];
            // fix sub Arrays if needed:
            if (expandSpec.innerValue) {
                content = fluid.model.transform.expandInnerValues([expander.inputPrefix, expandSpec.inputPath, k.toString()], 
                    [newKey], expander, expandSpec.innerValue);
            }
            newHash[newKey] = content;
        });
        return newHash;
    };

    fluid.model.transform.arrayToObject.invertRules = function (expandSpec, expander) {
        var togo = fluid.copy(expandSpec);
        togo.type = "fluid.model.transform.objectToArray";
        togo.inputPath = fluid.model.composePaths(expander.outputPrefix, expandSpec.outputPath);
        togo.outputPath = fluid.model.composePaths(expander.inputPrefix, expandSpec.inputPath);
        // invert expanders from innerValue as well:
        // TODO: The Model Transformations framework should be capable of this, but right now the
        // issue is that we use a "private contract" to operate the "innerValue" slot. We need to
        // spend time thinking of how this should be formalised
        if (togo.innerValue) {
            var innerValue = togo.innerValue;
            for (var i = 0; i < innerValue.length; ++i) {
                innerValue[i] = fluid.model.transform.invertConfiguration(innerValue[i]);
            }            
        }
        return togo;
    };
    

    fluid.defaults("fluid.model.transform.objectToArray", {
        gradeNames: "fluid.standardTransformFunction"
    });

    /**
     * Transforms an object into array of objects.
     * This performs the inverse transform of fluid.model.transform.arrayToObject.
     */
    fluid.model.transform.objectToArray = function (hash, expandSpec, expander) {
        if (expandSpec.key === undefined) {
            fluid.fail("objectToArray requires a 'key' option.", expandSpec);
        }
        
        var newArray = [];
        var pivot = expandSpec.key;

        fluid.each(hash, function (v, k) {
            var content = {};
            content[pivot] = k;
            if (expandSpec.innerValue) {
                v = fluid.model.transform.expandInnerValues([expandSpec.inputPath, k], [expandSpec.outputPath, newArray.length.toString()], 
                    expander, expandSpec.innerValue);
            }
            $.extend(true, content, v);
            newArray.push(content);
        });
        return newArray;
    };
})(jQuery, fluid_1_5);
/*
Copyright 2008-2010 University of Cambridge
Copyright 2008-2010 University of Toronto
Copyright 2010-2011 Lucendo Development Ltd.
Copyright 2010-2011 OCAD University

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global fluid:true, fluid_1_5:true, jQuery*/

// JSLint options 
/*jslint white: true, funcinvoke: true, elsecatch: true, operator: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

var fluid_1_5 = fluid_1_5 || {};
var fluid = fluid || fluid_1_5;

(function ($, fluid) {

    // $().fluid("selectable", args)
    // $().fluid("selectable".that()
    // $().fluid("pager.pagerBar", args)
    // $().fluid("reorderer", options)

/** Create a "bridge" from code written in the Fluid standard "that-ist" style,
 *  to the standard JQuery UI plugin architecture specified at http://docs.jquery.com/UI/Guidelines .
 *  Every Fluid component corresponding to the top-level standard signature (JQueryable, options)
 *  will automatically convert idiomatically to the JQuery UI standard via this adapter. 
 *  Any return value which is a primitive or array type will become the return value
 *  of the "bridged" function - however, where this function returns a general hash
 *  (object) this is interpreted as forming part of the Fluid "return that" pattern,
 *  and the function will instead be bridged to "return this" as per JQuery standard,
 *  permitting chaining to occur. However, as a courtesy, the particular "this" returned
 *  will be augmented with a function that() which will allow the original return
 *  value to be retrieved if desired.
 *  @param {String} name The name under which the "plugin space" is to be injected into
 *  JQuery
 *  @param {Object} peer The root of the namespace corresponding to the peer object.
 */

    fluid.thatistBridge = function (name, peer) {

        var togo = function (funcname) {
            var segs = funcname.split(".");
            var move = peer;
            for (var i = 0; i < segs.length; ++i) {
                move = move[segs[i]];
            }
            var args = [this];
            if (arguments.length === 2) {
                args = args.concat($.makeArray(arguments[1]));
            }
            var ret = move.apply(null, args);
            this.that = function () {
                return ret;
            };
            var type = typeof(ret);
            return !ret || type === "string" || type === "number" || type === "boolean"
                || (ret && ret.length !== undefined) ? ret : this;
        };
        $.fn[name] = togo;
        return togo;
    };

    fluid.thatistBridge("fluid", fluid);
    fluid.thatistBridge("fluid_1_5", fluid_1_5);

/*************************************************************************
 * Tabindex normalization - compensate for browser differences in naming
 * and function of "tabindex" attribute and tabbing order.
 */

    // -- Private functions --
    
    
    var normalizeTabindexName = function () {
        return $.browser.msie ? "tabIndex" : "tabindex";
    };

    var canHaveDefaultTabindex = function (elements) {
        if (elements.length <= 0) {
            return false;
        }

        return $(elements[0]).is("a, input, button, select, area, textarea, object");
    };
    
    var getValue = function (elements) {
        if (elements.length <= 0) {
            return undefined;
        }

        if (!fluid.tabindex.hasAttr(elements)) {
            return canHaveDefaultTabindex(elements) ? Number(0) : undefined;
        }

        // Get the attribute and return it as a number value.
        var value = elements.attr(normalizeTabindexName());
        return Number(value);
    };

    var setValue = function (elements, toIndex) {
        return elements.each(function (i, item) {
            $(item).attr(normalizeTabindexName(), toIndex);
        });
    };
    
    // -- Public API --
    
    /**
     * Gets the value of the tabindex attribute for the first item, or sets the tabindex value of all elements
     * if toIndex is specified.
     * 
     * @param {String|Number} toIndex
     */
    fluid.tabindex = function (target, toIndex) {
        target = $(target);
        if (toIndex !== null && toIndex !== undefined) {
            return setValue(target, toIndex);
        } else {
            return getValue(target);
        }
    };

    /**
     * Removes the tabindex attribute altogether from each element.
     */
    fluid.tabindex.remove = function (target) {
        target = $(target);
        return target.each(function (i, item) {
            $(item).removeAttr(normalizeTabindexName());
        });
    };

    /**
     * Determines if an element actually has a tabindex attribute present.
     */
    fluid.tabindex.hasAttr = function (target) {
        target = $(target);
        if (target.length <= 0) {
            return false;
        }
        var togo = target.map(
            function () {
                var attributeNode = this.getAttributeNode(normalizeTabindexName());
                return attributeNode ? attributeNode.specified : false;
            }
        );
        return togo.length === 1 ? togo[0] : togo;
    };

    /**
     * Determines if an element either has a tabindex attribute or is naturally tab-focussable.
     */
    fluid.tabindex.has = function (target) {
        target = $(target);
        return fluid.tabindex.hasAttr(target) || canHaveDefaultTabindex(target);
    };

    // Keyboard navigation
    // Public, static constants needed by the rest of the library.
    fluid.a11y = $.a11y || {};

    fluid.a11y.orientation = {
        HORIZONTAL: 0,
        VERTICAL: 1,
        BOTH: 2
    };

    var UP_DOWN_KEYMAP = {
        next: $.ui.keyCode.DOWN,
        previous: $.ui.keyCode.UP
    };

    var LEFT_RIGHT_KEYMAP = {
        next: $.ui.keyCode.RIGHT,
        previous: $.ui.keyCode.LEFT
    };

    // Private functions.
    var unwrap = function (element) {
        return element.jquery ? element[0] : element; // Unwrap the element if it's a jQuery.
    };


    var makeElementsTabFocussable = function (elements) {
        // If each element doesn't have a tabindex, or has one set to a negative value, set it to 0.
        elements.each(function (idx, item) {
            item = $(item);
            if (!item.fluid("tabindex.has") || item.fluid("tabindex") < 0) {
                item.fluid("tabindex", 0);
            }
        });
    };

    // Public API.
    /**
     * Makes all matched elements available in the tab order by setting their tabindices to "0".
     */
    fluid.tabbable = function (target) {
        target = $(target);
        makeElementsTabFocussable(target);
    };

    /*********************************************************************** 
     * Selectable functionality - geometrising a set of nodes such that they
     * can be navigated (by setting focus) using a set of directional keys
     */

    var CONTEXT_KEY = "selectionContext";
    var NO_SELECTION = -32768;

    var cleanUpWhenLeavingContainer = function (selectionContext) {
        if (selectionContext.activeItemIndex !== NO_SELECTION) {
            if (selectionContext.options.onLeaveContainer) {
                selectionContext.options.onLeaveContainer(
                    selectionContext.selectables[selectionContext.activeItemIndex]
                );
            } else if (selectionContext.options.onUnselect) {
                selectionContext.options.onUnselect(
                    selectionContext.selectables[selectionContext.activeItemIndex]
                );
            }
        }

        if (!selectionContext.options.rememberSelectionState) {
            selectionContext.activeItemIndex = NO_SELECTION;
        }
    };

    /**
     * Does the work of selecting an element and delegating to the client handler.
     */
    var drawSelection = function (elementToSelect, handler) {
        if (handler) {
            handler(elementToSelect);
        }
    };

    /**
     * Does does the work of unselecting an element and delegating to the client handler.
     */
    var eraseSelection = function (selectedElement, handler) {
        if (handler && selectedElement) {
            handler(selectedElement);
        }
    };

    var unselectElement = function (selectedElement, selectionContext) {
        eraseSelection(selectedElement, selectionContext.options.onUnselect);
    };

    var selectElement = function (elementToSelect, selectionContext) {
        // It's possible that we're being called programmatically, in which case we should clear any previous selection.
        unselectElement(selectionContext.selectedElement(), selectionContext);

        elementToSelect = unwrap(elementToSelect);
        var newIndex = selectionContext.selectables.index(elementToSelect);

        // Next check if the element is a known selectable. If not, do nothing.
        if (newIndex === -1) {
            return;
        }

        // Select the new element.
        selectionContext.activeItemIndex = newIndex;
        drawSelection(elementToSelect, selectionContext.options.onSelect);
    };

    var selectableFocusHandler = function (selectionContext) {
        return function (evt) {
            // FLUID-3590: newer browsers (FF 3.6, Webkit 4) have a form of "bug" in that they will go bananas
            // on attempting to move focus off an element which has tabindex dynamically set to -1.
            $(evt.target).fluid("tabindex", 0);
            selectElement(evt.target, selectionContext);

            // Force focus not to bubble on some browsers.
            return evt.stopPropagation();
        };
    };

    var selectableBlurHandler = function (selectionContext) {
        return function (evt) {
            $(evt.target).fluid("tabindex", selectionContext.options.selectablesTabindex);
            unselectElement(evt.target, selectionContext);

            // Force blur not to bubble on some browsers.
            return evt.stopPropagation();
        };
    };

    var reifyIndex = function (sc_that) {
        var elements = sc_that.selectables;
        if (sc_that.activeItemIndex >= elements.length) {
            sc_that.activeItemIndex = (sc_that.options.noWrap ? elements.length - 1 : 0);
        }
        if (sc_that.activeItemIndex < 0 && sc_that.activeItemIndex !== NO_SELECTION) {
            sc_that.activeItemIndex = (sc_that.options.noWrap ? 0 : elements.length - 1);
        }
        if (sc_that.activeItemIndex >= 0) {
            fluid.focus(elements[sc_that.activeItemIndex]);
        }
    };

    var prepareShift = function (selectionContext) {
        // FLUID-3590: FF 3.6 and Safari 4.x won't fire blur() when programmatically moving focus.
        var selElm = selectionContext.selectedElement();
        if (selElm) {
            fluid.blur(selElm);
        }

        unselectElement(selectionContext.selectedElement(), selectionContext);
        if (selectionContext.activeItemIndex === NO_SELECTION) {
            selectionContext.activeItemIndex = -1;
        }
    };

    var focusNextElement = function (selectionContext) {
        prepareShift(selectionContext);
        ++selectionContext.activeItemIndex;
        reifyIndex(selectionContext);
    };

    var focusPreviousElement = function (selectionContext) {
        prepareShift(selectionContext);
        --selectionContext.activeItemIndex;
        reifyIndex(selectionContext);
    };

    var arrowKeyHandler = function (selectionContext, keyMap, userHandlers) {
        return function (evt) {
            if (evt.which === keyMap.next) {
                focusNextElement(selectionContext);
                evt.preventDefault();
            } else if (evt.which === keyMap.previous) {
                focusPreviousElement(selectionContext);
                evt.preventDefault();
            }
        };
    };

    var getKeyMapForDirection = function (direction) {
        // Determine the appropriate mapping for next and previous based on the specified direction.
        var keyMap;
        if (direction === fluid.a11y.orientation.HORIZONTAL) {
            keyMap = LEFT_RIGHT_KEYMAP;
        } 
        else if (direction === fluid.a11y.orientation.VERTICAL) {
            // Assume vertical in any other case.
            keyMap = UP_DOWN_KEYMAP;
        }

        return keyMap;
    };

    var tabKeyHandler = function (selectionContext) {
        return function (evt) {
            if (evt.which !== $.ui.keyCode.TAB) {
                return;
            }
            cleanUpWhenLeavingContainer(selectionContext);

            // Catch Shift-Tab and note that focus is on its way out of the container.
            if (evt.shiftKey) {
                selectionContext.focusIsLeavingContainer = true;
            }
        };
    };

    var containerFocusHandler = function (selectionContext) {
        return function (evt) {
            var shouldOrig = selectionContext.options.autoSelectFirstItem;
            var shouldSelect = typeof(shouldOrig) === "function" ? shouldOrig() : shouldOrig;

            // Override the autoselection if we're on the way out of the container.
            if (selectionContext.focusIsLeavingContainer) {
                shouldSelect = false;
            }

            // This target check works around the fact that sometimes focus bubbles, even though it shouldn't.
            if (shouldSelect && evt.target === selectionContext.container.get(0)) {
                if (selectionContext.activeItemIndex === NO_SELECTION) {
                    selectionContext.activeItemIndex = 0;
                }
                fluid.focus(selectionContext.selectables[selectionContext.activeItemIndex]);
            }

            // Force focus not to bubble on some browsers.
            return evt.stopPropagation();
        };
    };

    var containerBlurHandler = function (selectionContext) {
        return function (evt) {
            selectionContext.focusIsLeavingContainer = false;

            // Force blur not to bubble on some browsers.
            return evt.stopPropagation();
        };
    };

    var makeElementsSelectable = function (container, defaults, userOptions) {

        var options = $.extend(true, {}, defaults, userOptions);

        var keyMap = getKeyMapForDirection(options.direction);

        var selectableElements = options.selectableElements ? options.selectableElements :
            container.find(options.selectableSelector);
          
        // Context stores the currently active item(undefined to start) and list of selectables.
        var that = {
            container: container,
            activeItemIndex: NO_SELECTION,
            selectables: selectableElements,
            focusIsLeavingContainer: false,
            options: options
        };

        that.selectablesUpdated = function (focusedItem) {
          // Remove selectables from the tab order and add focus/blur handlers
            if (typeof(that.options.selectablesTabindex) === "number") {
                that.selectables.fluid("tabindex", that.options.selectablesTabindex);
            }
            that.selectables.unbind("focus." + CONTEXT_KEY);
            that.selectables.unbind("blur." + CONTEXT_KEY);
            that.selectables.bind("focus." + CONTEXT_KEY, selectableFocusHandler(that));
            that.selectables.bind("blur."  + CONTEXT_KEY, selectableBlurHandler(that));
            if (keyMap && that.options.noBubbleListeners) {
                that.selectables.unbind("keydown." + CONTEXT_KEY);
                that.selectables.bind("keydown." + CONTEXT_KEY, arrowKeyHandler(that, keyMap));
            }
            if (focusedItem) {
                selectElement(focusedItem, that);
            }
            else {
                reifyIndex(that);
            }
        };

        that.refresh = function () {
            if (!that.options.selectableSelector) {
                fluid.fail("Cannot refresh selectable context which was not initialised by a selector");
            }
            that.selectables = container.find(options.selectableSelector);
            that.selectablesUpdated();
        };
        
        that.selectedElement = function () {
            return that.activeItemIndex < 0 ? null : that.selectables[that.activeItemIndex];
        };
        
        // Add various handlers to the container.
        if (keyMap && !that.options.noBubbleListeners) {
            container.keydown(arrowKeyHandler(that, keyMap));
        }
        container.keydown(tabKeyHandler(that));
        container.focus(containerFocusHandler(that));
        container.blur(containerBlurHandler(that));
        
        that.selectablesUpdated();

        return that;
    };

    /**
     * Makes all matched elements selectable with the arrow keys.
     * Supply your own handlers object with onSelect: and onUnselect: properties for custom behaviour.
     * Options provide configurability, including direction: and autoSelectFirstItem:
     * Currently supported directions are jQuery.a11y.directions.HORIZONTAL and VERTICAL.
     */
    fluid.selectable = function (target, options) {
        target = $(target);
        var that = makeElementsSelectable(target, fluid.selectable.defaults, options);
        fluid.setScopedData(target, CONTEXT_KEY, that);
        return that;
    };

    /**
     * Selects the specified element.
     */
    fluid.selectable.select = function (target, toSelect) {
        fluid.focus(toSelect);
    };

    /**
     * Selects the next matched element.
     */
    fluid.selectable.selectNext = function (target) {
        target = $(target);
        focusNextElement(fluid.getScopedData(target, CONTEXT_KEY));
    };

    /**
     * Selects the previous matched element.
     */
    fluid.selectable.selectPrevious = function (target) {
        target = $(target);
        focusPreviousElement(fluid.getScopedData(target, CONTEXT_KEY));
    };

    /**
     * Returns the currently selected item wrapped as a jQuery object.
     */
    fluid.selectable.currentSelection = function (target) {
        target = $(target);
        var that = fluid.getScopedData(target, CONTEXT_KEY);
        return $(that.selectedElement());
    };

    fluid.selectable.defaults = {
        direction: fluid.a11y.orientation.VERTICAL,
        selectablesTabindex: -1,
        autoSelectFirstItem: true,
        rememberSelectionState: true,
        selectableSelector: ".selectable",
        selectableElements: null,
        onSelect: null,
        onUnselect: null,
        onLeaveContainer: null,
        noWrap: false
    };

    /********************************************************************
     *  Activation functionality - declaratively associating actions with 
     * a set of keyboard bindings.
     */

    var checkForModifier = function (binding, evt) {
        // If no modifier was specified, just return true.
        if (!binding.modifier) {
            return true;
        }

        var modifierKey = binding.modifier;
        var isCtrlKeyPresent = modifierKey && evt.ctrlKey;
        var isAltKeyPresent = modifierKey && evt.altKey;
        var isShiftKeyPresent = modifierKey && evt.shiftKey;

        return isCtrlKeyPresent || isAltKeyPresent || isShiftKeyPresent;
    };

    /** Constructs a raw "keydown"-facing handler, given a binding entry. This
     *  checks whether the key event genuinely triggers the event and forwards it
     *  to any "activateHandler" registered in the binding. 
     */
    var makeActivationHandler = function (binding) {
        return function (evt) {
            var target = evt.target;
            if (!fluid.enabled(target)) {
                return;
            }
// The following 'if' clause works in the real world, but there's a bug in the jQuery simulation
// that causes keyboard simulation to fail in Safari, causing our tests to fail:
//     http://ui.jquery.com/bugs/ticket/3229
// The replacement 'if' clause works around this bug.
// When this issue is resolved, we should revert to the original clause.
//            if (evt.which === binding.key && binding.activateHandler && checkForModifier(binding, evt)) {
            var code = evt.which ? evt.which : evt.keyCode;
            if (code === binding.key && binding.activateHandler && checkForModifier(binding, evt)) {
                var event = $.Event("fluid-activate");
                $(target).trigger(event, [binding.activateHandler]);
                if (event.isDefaultPrevented()) {
                    evt.preventDefault();
                }
            }
        };
    };

    var makeElementsActivatable = function (elements, onActivateHandler, defaultKeys, options) {
        // Create bindings for each default key.
        var bindings = [];
        $(defaultKeys).each(function (index, key) {
            bindings.push({
                modifier: null,
                key: key,
                activateHandler: onActivateHandler
            });
        });

        // Merge with any additional key bindings.
        if (options && options.additionalBindings) {
            bindings = bindings.concat(options.additionalBindings);
        }

        fluid.initEnablement(elements);

        // Add listeners for each key binding.
        for (var i = 0; i < bindings.length; ++i) {
            var binding = bindings[i];
            elements.keydown(makeActivationHandler(binding));
        }
        elements.bind("fluid-activate", function (evt, handler) {
            handler = handler || onActivateHandler;
            return handler ? handler(evt) : null;
        });
    };

    /**
     * Makes all matched elements activatable with the Space and Enter keys.
     * Provide your own handler function for custom behaviour.
     * Options allow you to provide a list of additionalActivationKeys.
     */
    fluid.activatable = function (target, fn, options) {
        target = $(target);
        makeElementsActivatable(target, fn, fluid.activatable.defaults.keys, options);
    };

    /**
     * Activates the specified element.
     */
    fluid.activate = function (target) {
        $(target).trigger("fluid-activate");
    };

    // Public Defaults.
    fluid.activatable.defaults = {
        keys: [$.ui.keyCode.ENTER, $.ui.keyCode.SPACE]
    };

  
})(jQuery, fluid_1_5);
/*
Copyright 2010-2011 Lucendo Development Ltd.
Copyright 2010-2011 OCAD University

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

/** This file contains functions which depend on the presence of a DOM document
 *  and which depend on the contents of Fluid.js **/

// Declare dependencies
/*global fluid_1_5:true, jQuery*/

// JSLint options 
/*jslint white: true, funcinvoke: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

var fluid_1_5 = fluid_1_5 || {};

(function ($, fluid) {
    
    fluid.defaults("fluid.viewComponent", {
        gradeNames: ["fluid.littleComponent", "fluid.modelComponent", "fluid.eventedComponent"],
        initFunction: "fluid.initView",
        argumentMap: {
            container: 0,
            options: 1
        },
        members: { // Used to allow early access to DOM binder via IoC, but to also avoid triggering evaluation of selectors
            dom: {
                expander: {
                    funcName: "fluid.initDomBinder",
                    args: ["{that}", "{that}.options.selectors"]
                }
            }
        }
    });


    // unsupported, NON-API function
    // NOTE: this function represents a temporary strategy until we have more integrated IoC debugging.
    // It preserves the current framework behaviour for the 1.4 release, but provides a more informative
    // diagnostic - in fact, it is perfectly acceptable for a component's creator to return no value and
    // the failure is really in assumptions in fluid.initComponent. Revisit this issue for 1.5
    fluid.diagnoseFailedView = function (componentName, that, options, args) {
        if (!that && fluid.hasGrade(options, "fluid.viewComponent")) {
            var container = fluid.wrap(args[1]);
            var message1 = "Instantiation of autoInit component with type " + componentName + " failed, since ";
            if (container.length === 0) {
                fluid.fail(message1 + "selector \"", args[1], "\" did not match any markup in the document");
            } else {
                fluid.fail(message1 + " component creator function did not return a value");
            }  
        }  
    };
    
    fluid.checkTryCatchParameter = function () {
        var location = window.location || { search: "", protocol: "file:" };
        var GETparams = location.search.slice(1).split('&');
        return fluid.find(GETparams, function (param) {
            if (param.indexOf("notrycatch") === 0) {
                return true;
            }
        }) === true;
    };
    
    fluid.notrycatch = fluid.checkTryCatchParameter();

   
    /**
     * Wraps an object in a jQuery if it isn't already one. This function is useful since
     * it ensures to wrap a null or otherwise falsy argument to itself, rather than the
     * often unhelpful jQuery default of returning the overall document node.
     * 
     * @param {Object} obj the object to wrap in a jQuery
     * @param {jQuery} userJQuery the jQuery object to use for the wrapping, optional - use the current jQuery if absent
     */
    fluid.wrap = function (obj, userJQuery) {
        userJQuery = userJQuery || $;
        return ((!obj || obj.jquery) ? obj : userJQuery(obj)); 
    };
    
    /**
     * If obj is a jQuery, this function will return the first DOM element within it.
     * 
     * @param {jQuery} obj the jQuery instance to unwrap into a pure DOM element
     */
    fluid.unwrap = function (obj) {
        return obj && obj.jquery && obj.length === 1 ? obj[0] : obj; // Unwrap the element if it's a jQuery.
    };
    
    /**
     * Fetches a single container element and returns it as a jQuery.
     * 
     * @param {String||jQuery||element} containerSpec an id string, a single-element jQuery, or a DOM element specifying a unique container
     * @param {Boolean} fallible <code>true</code> if an empty container is to be reported as a valid condition
     * @return a single-element jQuery of container
     */
    fluid.container = function (containerSpec, fallible, userJQuery) {
        if (userJQuery) {
            containerSpec = fluid.unwrap(containerSpec);
        }
        var container = fluid.wrap(containerSpec, userJQuery);
        if (fallible && (!container || container.length === 0)) {
            return null;
        }
        
        // Throw an exception if we've got more or less than one element.
        if (!container || !container.jquery || container.length !== 1) {
            if (typeof (containerSpec) !== "string") {
                containerSpec = container.selector;
            }
            var count = container.length !== undefined ? container.length : 0;
            fluid.fail((count > 1 ? "More than one (" + count + ") container elements were"
                    : "No container element was") + " found for selector " + containerSpec);
        }
        if (!fluid.isDOMNode(container[0])) {
            fluid.fail("fluid.container was supplied a non-jQueryable element");  
        }
        
        return container;
    };
    
    /**
     * Creates a new DOM Binder instance, used to locate elements in the DOM by name.
     * 
     * @param {Object} container the root element in which to locate named elements
     * @param {Object} selectors a collection of named jQuery selectors
     */
    fluid.createDomBinder = function (container, selectors) {
        // don't put on a typename to avoid confusing primitive visitComponentChildren 
        var cache = {}, that = {id: fluid.allocateGuid()};
        var userJQuery = container.constructor;
        
        function cacheKey(name, thisContainer) {
            return fluid.allocateSimpleId(thisContainer) + "-" + name;
        }

        function record(name, thisContainer, result) {
            cache[cacheKey(name, thisContainer)] = result;
        }

        that.locate = function (name, localContainer) {
            var selector, thisContainer, togo;
            
            selector = selectors[name];
            thisContainer = localContainer ? localContainer : container;
            if (!thisContainer) {
                fluid.fail("DOM binder invoked for selector " + name + " without container");
            }

            if (!selector) {
                return thisContainer;
            }

            if (typeof (selector) === "function") {
                togo = userJQuery(selector.call(null, fluid.unwrap(thisContainer)));
            } else {
                togo = userJQuery(selector, thisContainer);
            }
            if (togo.get(0) === document) {
                togo = [];
            }
            if (!togo.selector) {
                togo.selector = selector;
                togo.context = thisContainer;
            }
            togo.selectorName = name;
            record(name, thisContainer, togo);
            return togo;
        };
        that.fastLocate = function (name, localContainer) {
            var thisContainer = localContainer ? localContainer : container;
            var key = cacheKey(name, thisContainer);
            var togo = cache[key];
            return togo ? togo : that.locate(name, localContainer);
        };
        that.clear = function () {
            cache = {};
        };
        that.refresh = function (names, localContainer) {
            var thisContainer = localContainer ? localContainer : container;
            if (typeof names === "string") {
                names = [names];
            }
            if (thisContainer.length === undefined) {
                thisContainer = [thisContainer];
            }
            for (var i = 0; i < names.length; ++i) {
                for (var j = 0; j < thisContainer.length; ++j) {
                    that.locate(names[i], thisContainer[j]);
                }
            }
        };
        that.resolvePathSegment = that.locate;
        
        return that;
    };
    
    /** Expect that jQuery selector query has resulted in a non-empty set of 
     * results. If none are found, this function will fail with a diagnostic message, 
     * with the supplied message prepended.
     */
    fluid.expectFilledSelector = function (result, message) {
        if (result && result.length === 0 && result.jquery) {
            fluid.fail(message + ": selector \"" + result.selector + "\" with name " + result.selectorName +
                       " returned no results in context " + fluid.dumpEl(result.context));
        }
    };
    
    /** 
     * The central initialiation method called as the first act of every Fluid
     * component. This function automatically merges user options with defaults,
     * attaches a DOM Binder to the instance, and configures events.
     * 
     * @param {String} componentName The unique "name" of the component, which will be used
     * to fetch the default options from store. By recommendation, this should be the global
     * name of the component's creator function.
     * @param {jQueryable} container A specifier for the single root "container node" in the
     * DOM which will house all the markup for this component.
     * @param {Object} userOptions The configuration options for this component.
     */
     // 4th argument is NOT SUPPORTED, see comments for initLittleComponent
    fluid.initView = function (componentName, containerSpec, userOptions, localOptions) {
        var container = fluid.container(containerSpec, true);
        fluid.expectFilledSelector(container, "Error instantiating component with name \"" + componentName);
        if (!container) {
            return null;
        }
        // Need to ensure container is set early, without relying on an IoC mechanism - rethink this with asynchrony
        var receiver = function (that, options, strategy) { 
            that.container = container;
        };
        var that = fluid.initLittleComponent(componentName, userOptions, localOptions || {gradeNames: ["fluid.viewComponent"]}, receiver);

        if (!that.dom) {
            fluid.initDomBinder(that);
        }
        // TODO: cannot afford a mutable container - put this into proper workflow
        var userJQuery = that.options.jQuery; // Do it a second time to correct for jQuery injection
        // if (userJQuery) {
        //    container = fluid.container(containerSpec, true, userJQuery);
        // }
        fluid.log("Constructing view component " + componentName + " with container " + container.constructor.expando + 
            (userJQuery ? " user jQuery " + userJQuery.expando : "") + " env: " + $.expando);

        return that;
    };
    
    /**
     * Creates a new DOM Binder instance for the specified component and mixes it in.
     * 
     * @param {Object} that the component instance to attach the new DOM Binder to
     */
    fluid.initDomBinder = function (that, selectors) {
        that.dom = fluid.createDomBinder(that.container, selectors || that.options.selectors || {});
        that.locate = that.dom.locate;
        return that.dom;
    };

    // DOM Utilities.
    
    /**
     * Finds the nearest ancestor of the element that passes the test
     * @param {Element} element DOM element
     * @param {Function} test A function which takes an element as a parameter and return true or false for some test
     */
    fluid.findAncestor = function (element, test) {
        element = fluid.unwrap(element);
        while (element) {
            if (test(element)) {
                return element;
            }
            element = element.parentNode;
        }
    };
    
    fluid.findForm = function (node) {
        return fluid.findAncestor(node, function (element) {
            return element.nodeName.toLowerCase() === "form";
        });
    };
    
    /** A utility with the same signature as jQuery.text and jQuery.html, but without the API irregularity
     * that treats a single argument of undefined as different to no arguments */
    // in jQuery 1.7.1, jQuery pulled the same dumb trick with $.text() that they did with $.val() previously,
    // see comment in fluid.value below
    fluid.each(["text", "html"], function (method) {
        fluid[method] = function (node, newValue) {
            node = $(node);
            return newValue === undefined ? node[method]() : node[method](newValue);
        };   
    });
    
    /** A generalisation of jQuery.val to correctly handle the case of acquiring and
     * setting the value of clustered radio button/checkbox sets, potentially, given
     * a node corresponding to just one element.
     */
    fluid.value = function (nodeIn, newValue) {
        var node = fluid.unwrap(nodeIn);
        var multiple = false;
        if (node.nodeType === undefined && node.length > 1) {
            node = node[0];
            multiple = true;
        }
        if ("input" !== node.nodeName.toLowerCase() || !/radio|checkbox/.test(node.type)) {
            // resist changes to contract of jQuery.val() in jQuery 1.5.1 (see FLUID-4113)
            return newValue === undefined ? $(node).val() : $(node).val(newValue);
        }
        var name = node.name;
        if (name === undefined) {
            fluid.fail("Cannot acquire value from node " + fluid.dumpEl(node) + " which does not have name attribute set");
        }
        var elements;
        if (multiple) {
            elements = nodeIn;
        } else {
            elements = node.ownerDocument.getElementsByName(name);
            var scope = fluid.findForm(node);
            elements = $.grep(elements, function (element) {
                if (element.name !== name) {
                    return false;
                }
                return !scope || fluid.dom.isContainer(scope, element);
            });
        }
        if (newValue !== undefined) {
            if (typeof(newValue) === "boolean") {
                newValue = (newValue ? "true" : "false");
            }
          // jQuery gets this partially right, but when dealing with radio button array will
          // set all of their values to "newValue" rather than setting the checked property
          // of the corresponding control. 
            $.each(elements, function () {
                this.checked = (newValue instanceof Array ? 
                    $.inArray(this.value, newValue) !== -1 : newValue === this.value);
            });
        } else { // this part jQuery will not do - extracting value from <input> array
            var checked = $.map(elements, function (element) {
                return element.checked ? element.value : null;
            });
            return node.type === "radio" ? checked[0] : checked;
        }
    };
    
    /**
     * Returns a jQuery object given the id of a DOM node. In the case the element
     * is not found, will return an empty list.
     */
    fluid.jById = function (id, dokkument) {
        dokkument = dokkument && dokkument.nodeType === 9 ? dokkument : document;
        var element = fluid.byId(id, dokkument);
        var togo = element ? $(element) : [];
        togo.selector = "#" + id;
        togo.context = dokkument;
        return togo;
    };
    
    /**
     * Returns an DOM element quickly, given an id
     * 
     * @param {Object} id the id of the DOM node to find
     * @param {Document} dokkument the document in which it is to be found (if left empty, use the current document)
     * @return The DOM element with this id, or null, if none exists in the document.
     */
    fluid.byId = function (id, dokkument) {
        dokkument = dokkument && dokkument.nodeType === 9 ? dokkument : document;
        var el = dokkument.getElementById(id);
        if (el) {
        // Use element id property here rather than attribute, to work around FLUID-3953
            if (el.id !== id) {
                fluid.fail("Problem in document structure - picked up element " +
                    fluid.dumpEl(el) + " for id " + id +
                    " without this id - most likely the element has a name which conflicts with this id");
            }
            return el;
        } else {
            return null;
        }
    };
    
    /**
     * Returns the id attribute from a jQuery or pure DOM element.
     * 
     * @param {jQuery||Element} element the element to return the id attribute for
     */
    fluid.getId = function (element) {
        return fluid.unwrap(element).id;
    };
    
    /** 
     * Allocate an id to the supplied element if it has none already, by a simple
     * scheme resulting in ids "fluid-id-nnnn" where nnnn is an increasing integer.
     */
    
    fluid.allocateSimpleId = function (element) {
        var simpleId = "fluid-id-" + fluid.allocateGuid();
        if (!element) {
            return simpleId;
        }
        element = fluid.unwrap(element);
        if (!element.id) {
            element.id = simpleId;
        }
        return element.id;
    };

    fluid.defaults("fluid.ariaLabeller", {
        labelAttribute: "aria-label",
        liveRegionMarkup: "<div class=\"liveRegion fl-offScreen-hidden\" aria-live=\"polite\"></div>",
        liveRegionId: "fluid-ariaLabeller-liveRegion",
        events: {
            generateLiveElement: "unicast"
        },
        listeners: {
            generateLiveElement: "fluid.ariaLabeller.generateLiveElement"
        }
    });
 
    fluid.ariaLabeller = function (element, options) {
        var that = fluid.initView("fluid.ariaLabeller", element, options);

        that.update = function (newOptions) {
            newOptions = newOptions || that.options;
            that.container.attr(that.options.labelAttribute, newOptions.text);
            if (newOptions.dynamicLabel) {
                var live = fluid.jById(that.options.liveRegionId); 
                if (live.length === 0) {
                    live = that.events.generateLiveElement.fire(that);
                }
                live.text(newOptions.text);
            }
        };
        
        that.update();
        return that;
    };
    
    fluid.ariaLabeller.generateLiveElement = function (that) {
        var liveEl = $(that.options.liveRegionMarkup);
        liveEl.prop("id", that.options.liveRegionId);
        $("body").append(liveEl);
        return liveEl;
    };
    
    var LABEL_KEY = "aria-labelling";
    
    fluid.getAriaLabeller = function (element) {
        element = $(element);
        var that = fluid.getScopedData(element, LABEL_KEY);
        return that;      
    };
    
    /** Manages an ARIA-mediated label attached to a given DOM element. An
     * aria-labelledby attribute and target node is fabricated in the document
     * if they do not exist already, and a "little component" is returned exposing a method
     * "update" that allows the text to be updated. */
    
    fluid.updateAriaLabel = function (element, text, options) {
        options = $.extend({}, options || {}, {text: text});
        var that = fluid.getAriaLabeller(element);
        if (!that) {
            that = fluid.ariaLabeller(element, options);
            fluid.setScopedData(element, LABEL_KEY, that);
        } else {
            that.update(options);
        }
        return that;
    };
    
    /** "Global Dismissal Handler" for the entire page. Attaches a click handler to the 
     * document root that will cause dismissal of any elements (typically dialogs) which 
     * have registered themselves. Dismissal through this route will automatically clean up 
     * the record - however, the dismisser themselves must take care to deregister in the case 
     * dismissal is triggered through the dialog interface itself. This component can also be 
     * automatically configured by fluid.deadMansBlur by means of the "cancelByDefault" option */ 
     
    var dismissList = {}; 
     
    $(document).click(function (event) { 
        var target = event.target; 
        while (target) { 
            if (dismissList[target.id]) { 
                return; 
            } 
            target = target.parentNode; 
        } 
        fluid.each(dismissList, function (dismissFunc, key) { 
            dismissFunc(event); 
            delete dismissList[key]; 
        }); 
    });
    // TODO: extend a configurable equivalent of the above dealing with "focusin" events
     
    /** Accepts a free hash of nodes and an optional "dismissal function".
     * If dismissFunc is set, this "arms" the dismissal system, such that when a click
     * is received OUTSIDE any of the hierarchy covered by "nodes", the dismissal function
     * will be executed.
     */ 
    fluid.globalDismissal = function (nodes, dismissFunc) { 
        fluid.each(nodes, function (node) {
          // Don't bother to use the real id if it is from a foreign document - we will never receive events
          // from it directly in any case - and foreign documents may be under the control of malign fiends
          // such as tinyMCE who allocate the same id to everything
            var id = fluid.unwrap(node).ownerDocument === document? fluid.allocateSimpleId(node) : fluid.allocateGuid();
            if (dismissFunc) { 
                dismissList[id] = dismissFunc; 
            } 
            else { 
                delete dismissList[id]; 
            } 
        }); 
    }; 
    
    /** Provides an abstraction for determing the current time.
     * This is to provide a fix for FLUID-4762, where IE6 - IE8 
     * do not support Date.now().
     */
    fluid.now = function () {
        return Date.now ? Date.now() : (new Date()).getTime();
    };
    
    /** Sets an interation on a target control, which morally manages a "blur" for
     * a possibly composite region.
     * A timed blur listener is set on the control, which waits for a short period of
     * time (options.delay, defaults to 150ms) to discover whether the reason for the 
     * blur interaction is that either a focus or click is being serviced on a nominated
     * set of "exclusions" (options.exclusions, a free hash of elements or jQueries). 
     * If no such event is received within the window, options.handler will be called
     * with the argument "control", to service whatever interaction is required of the
     * blur.
     */
    
    fluid.deadMansBlur = function (control, options) {
        var that = fluid.initLittleComponent("fluid.deadMansBlur", options);
        that.blurPending = false;
        that.lastCancel = 0;
        that.canceller = function (event) {
            fluid.log("Cancellation through " + event.type + " on " + fluid.dumpEl(event.target)); 
            that.lastCancel = fluid.now();
            that.blurPending = false;
        };
        that.noteProceeded = function () {
            fluid.globalDismissal(that.options.exclusions);
        };
        that.reArm = function () {
            fluid.globalDismissal(that.options.exclusions, that.proceed);
        };
        that.addExclusion = function (exclusions) {
            fluid.globalDismissal(exclusions, that.proceed);
        };
        that.proceed = function (event) {
            fluid.log("Direct proceed through " + event.type + " on " + fluid.dumpEl(event.target));
            that.blurPending = false;
            that.options.handler(control);
        };
        fluid.each(that.options.exclusions, function (exclusion) {
            exclusion = $(exclusion);
            fluid.each(exclusion, function (excludeEl) {
                $(excludeEl).bind("focusin", that.canceller).
                    bind("fluid-focus", that.canceller).
                    click(that.canceller).mousedown(that.canceller);
    // Mousedown is added for FLUID-4212, as a result of Chrome bug 6759, 14204
            });
        });
        if (!that.options.cancelByDefault) {
            $(control).bind("focusout", function (event) {
                fluid.log("Starting blur timer for element " + fluid.dumpEl(event.target));
                var now = fluid.now();
                fluid.log("back delay: " + (now - that.lastCancel));
                if (now - that.lastCancel > that.options.backDelay) {
                    that.blurPending = true;
                }
                setTimeout(function () {
                    if (that.blurPending) {
                        that.options.handler(control);
                    }
                }, that.options.delay);
            });
        }
        else {
            that.reArm();
        }
        return that;
    };

    fluid.defaults("fluid.deadMansBlur", {
        delay: 150,
        backDelay: 100
    });
    
})(jQuery, fluid_1_5);
/*
Copyright 2011-2013 OCAD University
Copyright 2010-2011 Lucendo Development Ltd.

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global fluid_1_5:true, jQuery*/

// JSLint options 
/*jslint white: true, funcinvoke: true, continue: true, elsecatch: true, operator: true, jslintok:true, undef: true, newcap: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 1000, indent: 4 */

var fluid_1_5 = fluid_1_5 || {};

(function ($, fluid) {

    /** The Fluid "IoC System proper" - resolution of references and 
     * completely automated instantiation of declaratively defined
     * component trees */
    
    // unsupported, non-API function
    // Currently still uses manual traversal - once we ban manually instantiated components,
    // it will use the instantiator's records instead.
    fluid.visitComponentChildren = function (that, visitor, options, path, i) {
        var instantiator = fluid.getInstantiator(that);
        for (var name in that) {
            var newPath = instantiator.composePath(path, name);
            var component = that[name];
            // Every component *should* have an id, but some clients (e.g. DOM binder) may not yet be compliant
            // This entire algorithm is primitive and expensive and will be removed once we can abolish manual init components
            if (!component || !component.typeName || (component.id && options.visited && options.visited[component.id])) {continue; }
            if (options.visited) {
                options.visited[component.id] = true;
            }
            if (visitor(component, name, newPath, path, i)) {
                return true;
            }
            if (!options.flat) {
                fluid.visitComponentChildren(component, visitor, options, newPath);
            }
        }
    };
    
    // unsupported, non-API function
    fluid.getMemberNames = function (instantiator, thatStack) {
        var path = instantiator.idToPath(thatStack[thatStack.length - 1].id);
        var segs = fluid.model.parseEL(path);
        segs.unshift.apply(segs, fluid.generate(thatStack.length - segs.length, ""));
        return segs;
    };
    
    // thatStack contains an increasing list of MORE SPECIFIC thats.
    // this visits all components starting from the current location (end of stack)
    // in visibility order up the tree.
    var visitComponents = function (instantiator, thatStack, visitor, options) {
        options = options || {
            visited: {},
            flat: true,
            instantiator: instantiator
        };
        var memberNames = fluid.getMemberNames(instantiator, thatStack);
        for (var i = thatStack.length - 1; i >= 0; --i) {
            var that = thatStack[i], path;
            if (that.typeName) {
                options.visited[that.id] = true;
                path = instantiator.idToPath[that.id];
                if (visitor(that, memberNames[i], path, path, i)) {
                    return;
                }
            }
            if (fluid.visitComponentChildren(that, visitor, options, path, i)) {
                return;
            }
        }
    };
    
    fluid.mountStrategy = function (prefix, root, toMount, targetPrefix) {
        var offset = prefix.length;
        return function (target, name, i, segs) {
            if (i <= prefix.length) { // Avoid OOB to not trigger deoptimisation!
                return;
            }
            for (var j = 0; j < prefix.length; ++ j) {
                if (segs[j] !== prefix[j]) {
                    return;
                }
            }
            return toMount(target, name, i - prefix.length, segs.slice(offset));
        }
    };
    
    // unsupported, NON-API function    
    fluid.invokerFromRecord = function (invokerec, name, that) {
        fluid.pushActivity("makeInvoker", "beginning instantiation of invoker with name %name and record %record as child of %that", 
            {name: name, record: invokerec, that: that});
        var invoker = fluid.makeInvoker(that, invokerec, name);
        fluid.popActivity();
        return invoker;
    };

    // unsupported, NON-API function    
    fluid.memberFromRecord = function (memberrec, name, that) {
        var value = fluid.expandOptions(memberrec, that);
        return value;
    };

    // unsupported, NON-API function    
    fluid.recordStrategy = function (that, options, optionsStrategy, recordPath, recordMaker, prefix) {
        prefix = prefix || [];
        return {
            strategy: function (target, name, i, segs) {
                if (i !== 1) {
                    return;
                }
                var record = fluid.driveStrategy(options, [recordPath, name], optionsStrategy);
                if (record === undefined) {
                    return;
                }
                fluid.set(target, [name], fluid.inEvaluationMarker);
                var member = recordMaker(record, name, that);
                fluid.set(target, [name], member);
                return member;
            },
            initter: function () {
                var records = fluid.driveStrategy(options, recordPath, optionsStrategy) || {};
                for (var name in records) {
                    fluid.getForComponent(that, prefix.concat([name]));
                }
            }
        };
    };
    
    // patch Fluid.js version for timing
    // unsupported, NON-API function
    fluid.instantiateFirers = function (that, options) {
        var shadow = fluid.shadowForComponent(that);
        var initter = fluid.get(shadow, ["eventStrategyBlock", "initter"]) || fluid.identity;
        initter();
    };

    // unsupported, NON-API function
    fluid.makeDistributionRecord = function (contextThat, sourceRecord, sourcePath, targetSegs, exclusions, offset, sourceType) {
        offset = offset || 0;
        sourceType = sourceType || "distribution";

        var source = fluid.copy(fluid.get(sourceRecord, sourcePath));
        fluid.each(exclusions, function (exclusion) {
            fluid.model.applyChangeRequest(source, {path: exclusion, type: "DELETE"});
        });

        var record = {options: {}};
        var primitiveSource = fluid.isPrimitive(source);
        fluid.model.applyChangeRequest(record, {path: targetSegs, type: primitiveSource? "ADD": "MERGE", value: source});
        return $.extend(record, {contextThat: contextThat, recordType: sourceType, priority: fluid.mergeRecordTypes.distribution + offset});
    };

    // unsupported, NON-API function    
    fluid.filterBlocks = function (contextThat, sourceBlocks, sourcePath, targetSegs, exclusions, removeSource) {
        var togo = [], offset = 0;
        fluid.each(sourceBlocks, function (block) {
            var source = fluid.get(block.source, sourcePath);
            if (source) {
                togo.push(fluid.makeDistributionRecord(contextThat, block.source, sourcePath, targetSegs, exclusions, offset++, block.recordType));
                var rescued = $.extend({}, source);
                if (removeSource) {
                    fluid.model.applyChangeRequest(block.source, {path: sourcePath, type: "DELETE"});
                }
                fluid.each(exclusions, function (exclusion) {
                    var orig = fluid.get(rescued, exclusion);
                    fluid.set(block.source, sourcePath.concat(exclusion), orig);
                });
            }
        });
        return togo; 
    };
    
    // unsupported, NON-API function
    // TODO: This implementation is obviously poor and has numerous flaws
    fluid.matchIoCSelector = function (selector, thatStack, contextHashes, memberNames, i) {
        var thatpos = thatStack.length - 1;
        var selpos = selector.length - 1;
        while (true) {
            var mustMatchHere = thatpos === thatStack.length - 1 || selector[selpos].child;
            
            var that = thatStack[thatpos];  
            var selel = selector[selpos];
            var match = true;
            for (var j = 0; j < selel.predList.length; ++j) {
                var pred = selel.predList[j];
                if (pred.context && !(contextHashes[thatpos][pred.context] || memberNames[thatpos] === pred.context)) {
                    match = false;
                    break;
                }
                if (pred.id && that.id !== pred.id) {
                    match = false;
                    break;
                }
            }
            if (selpos === 0 && thatpos > i && mustMatchHere) {
                match = false; // child selector must exhaust stack completely - FLUID-5029
            }
            if (match) {
                if (selpos === 0) {
                    return true;
                }
                --thatpos;
                --selpos;
            }
            else {
                if (mustMatchHere) {
                    return false;
                }
                else {
                    --thatpos;
                }
            }
            if (thatpos < i) {
                return false;
            }
        }
    };
    
    // unsupported, NON-API function
    fluid.collectDistributions = function (distributedBlocks, distribution, thatStack, contextHashes, memberNames, i) {
        if (fluid.matchIoCSelector(distribution.selector, thatStack, contextHashes, memberNames, i)) {
            distributedBlocks.push.apply(distributedBlocks, distribution.blocks);
        }
    };

    fluid.getMembers = function (holder, name) {
        return fluid.transform(holder, function(member) {
            return fluid.get(member, name);
        });
    };

    // unsupported, NON-API function 
    fluid.receiveDistributions = function (parentThat, gradeNames, memberName) {
        var instantiator = fluid.getInstantiator(parentThat);
        var thatStack = instantiator.getThatStack(parentThat); // most specific is at end
        var memberNames = fluid.getMemberNames(instantiator, thatStack);
        memberNames.push(memberName);
        var distributedBlocks = [];
        var shadows = fluid.transform(thatStack, function (thisThat) {
            return instantiator.idToShadow[thisThat.id];
        });
        var contextHashes = fluid.getMembers(shadows, "contextHash");
        contextHashes.push(fluid.gradeNamesToHash(gradeNames));
        thatStack.push({}); // fake "that" since we try to match selectors before creation for FLUID-5013
        for (var i = 0; i < thatStack.length - 1; ++ i) {
            fluid.each(shadows[i].distributions, function (distribution) {
                fluid.collectDistributions(distributedBlocks, distribution, thatStack, contextHashes, memberNames, i);
            });
        }
        return distributedBlocks;
    };

    // unsupported, NON-API function 
    fluid.applyDistributions = function (that, preBlocks, targetShadow) {
        var distributedBlocks = fluid.transform(preBlocks, function (preBlock) {
            return fluid.generateExpandBlock(preBlock, that, targetShadow.mergePolicy);
        });
        var mergeOptions = targetShadow.mergeOptions;
        mergeOptions.mergeBlocks.push.apply(mergeOptions.mergeBlocks, distributedBlocks);
        mergeOptions.updateBlocks();  
    };

    // unsupported, NON-API function
    fluid.parseExpectedOptionsPath = function (path, role) {
        var segs = fluid.model.parseEL(path);
        if (segs.length > 1 && segs[0] !== "options") {
            fluid.fail("Error in options distribution record ", record, " - only " + role + " paths beginning with \"options\" are supported");
        }
        return segs.slice(1);  
    };
    
    // unsupported, NON-API function    
    fluid.isIoCSSSelector = function (context) {
        return context.indexOf(" ") !== -1; // simple-minded check for an IoCSS reference  
    };

    // unsupported, NON-API function     
    fluid.pushDistributions = function (targetHead, selector, blocks) {
        var targetShadow = fluid.shadowForComponent(targetHead);
        var id = fluid.allocateGuid();
        var distributions = (targetShadow.distributions = targetShadow.distributions || []);
        distributions.push({
            id: id,
            selector: selector,
            blocks: blocks
        });
        return id;
    };

    // unsupported, NON-API function    
    fluid.clearDistributions = function (targetHead, id) {
        var targetShadow = fluid.shadowForComponent(targetHead);
        fluid.remove_if(targetShadow.distributions, function (distribution) {
            return distribution.id === id;
        });
    };
    
    // unsupported, NON-API function
    // Modifies a parsed selector to extra its head context which will be matched upwards     
    fluid.extractSelectorHead = function (parsedSelector) {
        var predList = parsedSelector[0].predList;
        var context = predList[0].context;
        predList.length = 0;
        return context;
    };

    fluid.undistributableOptions = ["gradeNames", "distributeOptions", "returnedPath", "argumentMap", "initFunction", "mergePolicy", "progressiveCheckerOptions"]; // automatically added to "exclusions" of every distribution

    // unsupported, NON-API function    
    fluid.distributeOptions = function (that, optionsStrategy) {
        var records = fluid.makeArray(fluid.driveStrategy(that.options, "distributeOptions", optionsStrategy));
        fluid.each(records, function (record) {
            var targetRef = fluid.parseContextReference(record.target);
            var targetComp, selector;
            if (fluid.isIoCSSSelector(targetRef.context)) {
                selector = fluid.parseSelector(targetRef.context, fluid.IoCSSMatcher);
                var headContext = fluid.extractSelectorHead(selector);
                if (headContext !== "that") {
                    fluid.fail("Downwards options distribution not supported from component other than \"that\"");
                }
                targetComp = that;
            }
            else {
                targetComp = fluid.resolveContext(targetRef.context, that);
                if (!targetComp) {
                    fluid.fail("Error in options distribution record ", record, " - could not resolve context selector {"+targetRef.context+"} to a root component");
                }
            }
            var targetSegs = fluid.model.parseEL(targetRef.path);
            var preBlocks;
            if (record.record) {
                preBlocks = [(fluid.makeDistributionRecord(that, record.record, [], targetSegs, [], 0))];
            }
            else {
                var thatShadow = fluid.shadowForComponent(that);
                var source = fluid.parseContextReference(record.source || "{that}.options");
                if (source.context !== "that") {
                    fluid.fail("Error in options distribution record ", record, " only a context of {that} is supported");
                }
                var sourcePath = fluid.parseExpectedOptionsPath(source.path, "source");
                var fullExclusions = fluid.makeArray(record.exclusions).concat(sourcePath.length === 0 ? fluid.undistributableOptions : []); 
                
                var exclusions = fluid.transform(fullExclusions, function (exclusion) {
                    return fluid.model.parseEL(exclusion);  
                });
                
                preBlocks = fluid.filterBlocks(that, thatShadow.mergeOptions.mergeBlocks, sourcePath, targetSegs, exclusions, record.removeSource);
                thatShadow.mergeOptions.updateBlocks(); // perhaps unnecessary
            }
            // TODO: inline material has to be expanded in its original context!
            
            if (selector) {
                fluid.pushDistributions(targetComp, selector, preBlocks);
            }
            else { // The component exists now, we must rebalance it
                var targetShadow = fluid.shadowForComponent(targetComp);
                fluid.applyDistributions(that, preBlocks, targetShadow);
            }
        });
    };

    // unsupported, NON-API function    
    fluid.gradeNamesToHash = function (gradeNames) {
        var contextHash = {};
        fluid.each(gradeNames, function (gradeName) {
            contextHash[gradeName] = true;
            contextHash[fluid.computeNickName(gradeName)] = true;  
        });
        return contextHash;      
    };

    // unsupported, NON-API function    
    fluid.cacheShadowGrades = function (that, shadow) {
        var contextHash = fluid.gradeNamesToHash(that.options.gradeNames);
        contextHash[that.nickName] = true;
        shadow.contextHash = contextHash;      
    };
    
    // First sequence point where the mergeOptions strategy is delivered from Fluid.js - here we take care
    // of both receiving and transmitting options distributions
    // unsupported, NON-API function
    fluid.deliverOptionsStrategy = function (that, target, mergeOptions) {
        var shadow = fluid.shadowForComponent(that, shadow);
        fluid.cacheShadowGrades(that, shadow);
        shadow.mergeOptions = mergeOptions;
    };

    // unsupported, NON-API function    
    fluid.resolveReturnedPath = function (returnedPath, that) {
        var shadow = fluid.shadowForComponent(that);
        // This prevents corruption of instantiator records by defeating effect of "returnedPath" for non-roots 
        return shadow && shadow.path !== "" ? null : returnedPath;
    };

    // unsupported, NON-API function    
    fluid.computeDynamicGrades = function (that, shadow, strategy) {
        delete that.options.gradeNames; // Recompute gradeNames for FLUID-5012 and others
        var gradeNames = fluid.driveStrategy(that.options, "gradeNames", strategy);
        
        // TODO: In complex distribution cases, a component might end up with multiple default blocks
        var defaultsBlock = fluid.findMergeBlocks(shadow.mergeOptions.mergeBlocks, "defaults")[0];
        var dynamicGrades = fluid.remove_if(gradeNames, function (gradeName) {
            return gradeName.charAt(0) === "{" || !fluid.hasGrade(defaultsBlock.target, gradeName);
        }, []);
        var resolved = [];
        fluid.each(dynamicGrades, function (dynamicGrade) {
            var func = fluid.expandOptions(dynamicGrade, that);
            resolved = resolved.concat(typeof(func) === "function" ? func() : func);
        });
        if (resolved.length !== 0) {
            var newDefaults = fluid.copy(fluid.getGradedDefaults(that.typeName, resolved));
            gradeNames.length = 0; // acquire derivatives of dynamic grades (FLUID-5054)
            gradeNames.push.apply(gradeNames, newDefaults.gradeNames);
            fluid.cacheShadowGrades(that, shadow);
            
            var defaultsBlock = fluid.findMergeBlocks(shadow.mergeOptions.mergeBlocks, "defaults")[0];
            defaultsBlock.source = newDefaults;
            shadow.mergeOptions.updateBlocks();
        }
    };
    
    fluid.computeDynamicComponentKey = function (recordKey, sourceKey) {
        return recordKey + (sourceKey === 0 ? "" : "-" + sourceKey); // TODO: configurable name strategies      
    };

    // unsupported, NON-API function    
    fluid.registerDynamicRecord = function (that, recordKey, sourceKey, record, toCensor) {
        var key = fluid.computeDynamicComponentKey(recordKey, sourceKey);
        var cRecord = fluid.copy(record);
        delete cRecord[toCensor];
        fluid.set(that.options, ["components", key], cRecord);
        return key;
    };

    // unsupported, NON-API function
    fluid.computeDynamicComponents = function (that, mergeOptions) {
        var shadow = fluid.shadowForComponent(that);
        var localSub = shadow.subcomponentLocal = {};
        var records = fluid.driveStrategy(that.options, "dynamicComponents", mergeOptions.strategy);
        fluid.each(records, function (record, recordKey) {
            if (!record.sources && !record.createOnEvent) {
                fluid.fail("Cannot process dynamicComponents record ", record, " without a \"sources\" or \"createOnEvent\" entry");  
            }
            if (record.sources) {
                var sources = fluid.expandOptions(record.sources, that);
                fluid.each(sources, function (source, sourceKey) {
                    var key = fluid.registerDynamicRecord(that, recordKey, sourceKey, record, "sources");
                    localSub[key] = {"source": source, "sourcePath": sourceKey};
                });
            }
            else if (record.createOnEvent) {
               var event = fluid.event.expandOneEvent(that, record.createOnEvent);
               fluid.set(shadow, ["dynamicComponentCount", recordKey], 0);
               var listener = function () {
                    var key = fluid.registerDynamicRecord(that, recordKey, shadow.dynamicComponentCount[recordKey]++, record, "createOnEvent");
                    localSub[key] = {"arguments": fluid.makeArray(arguments)};
                    fluid.initDependent(that, key);
               };
               event.addListener(listener);
               fluid.recordListener(event, listener, shadow);
            }
        });
    };
    
    // Second sequence point for mergeOptions from Fluid.js - here we construct all further
    // strategies required on the IoC side and mount them into the shadow's getConfig for universal use
    // unsupported, NON-API function
    fluid.computeComponentAccessor = function (that) {
        var shadow = fluid.shadowForComponent(that);
        var options = that.options;
        var strategy = shadow.mergeOptions.strategy;
        var optionsStrategy = fluid.mountStrategy(["options"], options, strategy);
        shadow.invokerStrategy = fluid.recordStrategy(that, options, strategy, "invokers", fluid.invokerFromRecord);
        shadow.eventStrategyBlock = fluid.recordStrategy(that, options, strategy, "events", fluid.eventFromRecord, ["events"]);
        var eventStrategy = fluid.mountStrategy(["events"], that, shadow.eventStrategyBlock.strategy, ["events"]);
        shadow.memberStrategy = fluid.recordStrategy(that, options, strategy, "members", fluid.memberFromRecord);
        // NB - ginger strategy handles concrete, rationalise
        shadow.getConfig = {strategies: [fluid.model.funcResolverStrategy, fluid.makeGingerStrategy(that), 
            optionsStrategy, shadow.invokerStrategy.strategy, shadow.memberStrategy.strategy, eventStrategy]};
            
        fluid.computeDynamicGrades(that, shadow, strategy, shadow.mergeOptions.mergeBlocks);
        fluid.distributeOptions(that, strategy);
        
        return shadow.getConfig;
    };
    
    fluid.shadowForComponent = function (component) {
        var instantiator = fluid.getInstantiator(component);
        return shadow = instantiator && component ? instantiator.idToShadow[component.id] : null;      
    };
    
    fluid.getForComponent = function (component, path) {
        var shadow = fluid.shadowForComponent(component);
        var getConfig = shadow ? shadow.getConfig : undefined;
        return fluid.get(component, path, getConfig);
    };
    
    // An EL segment resolver strategy that will attempt to trigger creation of
    // components that it discovers along the EL path, if they have been defined but not yet
    // constructed.
    // unsupported, NON-API function
    fluid.makeGingerStrategy = function (that) {
        var instantiator = fluid.getInstantiator(that);
        return function (component, thisSeg, index, segs) {
            var atval = component[thisSeg];
            if (atval === fluid.inEvaluationMarker && index === segs.length) {
                fluid.fail("Error in component configuration - a circular reference was found during evaluation of path segment \"" + thisSeg
                + "\": for more details, see the activity records following this message in the console, or issue fluid.setLogging(fluid.logLevel.TRACE) when running your application"); 
            }
            if (index > 1) {
                return atval;
            }
            if (atval === undefined) { // pick up components in instantiation here - we can cut this branch by attaching early
                var parentPath = instantiator.idToShadow[component.id].path;
                var childPath = fluid.composePath(parentPath, thisSeg);
                atval = instantiator.pathToComponent[childPath];
            }
            if (atval === undefined) {
                // TODO: This check is very expensive - once gingerness is stable, we ought to be able to 
                // eagerly compute and cache the value of options.components - check is also incorrect and will miss injections
                if (fluid.getForComponent(component, ["options", "components", thisSeg])) {
                    fluid.initDependent(component, thisSeg);
                    atval = component[thisSeg];
                }
            }
            return atval;
        };
    };
    
    fluid.filterBuiltinGrades = function (gradeNames) {
        return fluid.remove_if(fluid.makeArray(gradeNames), function (gradeName) {
            return /autoInit|fluid.littleComponent|fluid.modelComponent|fluid.eventedComponent|fluid.viewComponent|fluid.typeFount/.test(gradeName);
        });
    };
    
    fluid.dumpGradeNames = function (that) {
        return that.options && that.options.gradeNames ? 
            " gradeNames: " + JSON.stringify(fluid.filterBuiltinGrades(that.options.gradeNames)) : ""; 
    };
    
    // unsupported, non-API function
    fluid.dumpThat = function (that) {
        return "{ typeName: \"" + that.typeName + "\"" + 
             fluid.dumpGradeNames(that) + " id: " + that.id + "}";
    };
    
    // unsupported, non-API function
    fluid.dumpThatStack = function (thatStack, instantiator) {
        var togo = fluid.transform(thatStack, function(that) {
            var path = instantiator.idToPath(that.id);
            return fluid.dumpThat(that) + (path? (" - path: " + path) : "");
        });
        return togo.join("\n");
    };

    var localRecordExpected = /arguments|options|container|source|sourcePath/;

    // unsupported, NON-API function    
    fluid.resolveContext = function (context, that) {
        var instantiator = fluid.getInstantiator(that);
        if (context === "instantiator") {
            return instantiator;
        }
        else if (context === "that") {
            return that; 
        }
        var foundComponent;
        var thatStack = instantiator.getFullStack(that);
        visitComponents(instantiator, thatStack, function (component, name) {
            var shadow = fluid.shadowForComponent(component);
            // TODO: Some components, e.g. the static environment and typeTags do not have a shadow, which slows us down here 
            if (context === name || shadow && shadow.contextHash && shadow.contextHash[context] || context === component.typeName || context === component.nickName) {
                foundComponent = component;
                return true; // YOUR VISIT IS AT AN END!!
            }
            if (fluid.getForComponent(component, ["options", "components", context, "type"]) && !component[context]) {
  // This is an expensive guess since we make it for every component up the stack - must apply the WAVE OF EXPLOSION (FLUID-4925) to discover all components first
  // This line attempts a hopeful construction of components that could be guessed by nickname through finding them unconstructed
  // in options. In the near future we should eagerly BEGIN the process of constructing components, discovering their
  // types and then attaching them to the tree VERY EARLY so that we get consistent results from different strategies.
                foundComponent = fluid.getForComponent(component, context);
                return true;
            }
        });
        return foundComponent;
    };
    
    // unsupported, NON-API function
    fluid.makeStackFetcher = function (parentThat, localRecord) {
        var fetcher = function (parsed) {
            var context = parsed.context;
            if (localRecord && localRecordExpected.test(context)) {
                var fetched = fluid.get(localRecord[context], parsed.path);
                return context === "arguments" || context === "source" || context === "sourcePath" ? fetched : {
                    marker: context === "options" ? fluid.EXPAND : fluid.EXPAND_NOW,
                    value: fetched
                };
            }
            var foundComponent = fluid.resolveContext(context, parentThat);
            if (!foundComponent && parsed.path !== "") {
                var ref = fluid.renderContextReference(parsed);
                fluid.fail("Failed to resolve reference " + ref + " - could not match context with name " 
                    + context + " from component leaf ", parentThat);
            }
            return fluid.getForComponent(foundComponent, parsed.path);
        };
        return fetcher;
    };

    // unsupported, NON-API function     
    fluid.makeStackResolverOptions = function (parentThat, localRecord) {
        return $.extend(fluid.copy(fluid.rawDefaults("fluid.makeExpandOptions")), {
            fetcher: fluid.makeStackFetcher(parentThat, localRecord),
            contextThat: parentThat
        }); 
    };
    
    // unsupported, non-API function
    fluid.clearListeners = function (shadow) {
        fluid.each(shadow.listeners, function (rec) {
            rec.event.removeListener(rec.listener);  
        });
        delete shadow.listeners;
    };

    // unsupported, non-API function    
    fluid.recordListener = function (event, listener, shadow) {
        var listeners = shadow.listeners;
        if (!listeners) {
            listeners = shadow.listeners = [];
        }
        listeners.push({event: event, listener: listener});
    };
    
    var idToInstantiator = {};
    
    // unsupported, non-API function - however, this structure is of considerable interest to those debugging
    // into IoC issues. The structures idToShadow and pathToComponent contain a complete map of the component tree
    // forming the surrounding scope
    fluid.instantiator = function (freeInstantiator) {
        var that = {
            id: fluid.allocateGuid(),
            nickName: "instantiator",
            pathToComponent: {},
            idToShadow: {},
            composePath: fluid.composePath // For speed, we declare that no component's name may contain a period
        };
        // We frequently get requests for components not in this instantiator - e.g. from the dynamicEnvironment or manually created ones
        that.idToPath = function (id) {
            var shadow = that.idToShadow[id];
            return shadow ? shadow.path : "";
        };
        that.getThatStack = function (component) {
            var shadow = that.idToShadow[component.id];
            if (shadow) {
                var path = shadow.path;
                var parsed = fluid.model.parseEL(path);
                var togo = fluid.transform(parsed, function (value, i) {
                    var parentPath = fluid.model.composeSegments.apply(null, parsed.slice(0, i + 1));
                    return that.pathToComponent[parentPath];
                });
                var root = that.pathToComponent[""];
                if (root) {
                    togo.unshift(root);
                }
                return togo;
            }
            else { return [component];}
        };
        that.getEnvironmentalStack = function () {
            var togo = [fluid.staticEnvironment];
            if (!freeInstantiator) {
                togo.push(fluid.globalThreadLocal());
            }
            return togo;
        };
        that.getFullStack = function (component) {
            var thatStack = component? that.getThatStack(component) : [];
            return that.getEnvironmentalStack().concat(thatStack);
        };
        function recordComponent(component, path, created) {
            if (created) {
                idToInstantiator[component.id] = that;
                var shadow = that.idToShadow[component.id] = {};
                shadow.path = path;
            }
            if (that.pathToComponent[path]) {
                fluid.fail("Error during instantiation - path " + path + " which has just created component " + fluid.dumpThat(component) 
                    + " has already been used for component " + fluid.dumpThat(that.pathToComponent[path]) + " - this is a circular instantiation or other oversight."
                    + " Please clear the component using instantiator.clearComponent() before reusing the path.");
            }
            that.pathToComponent[path] = component;
        }
        that.recordRoot = function (component) {
            if (component && component.id && !that.pathToComponent[""]) {
                recordComponent(component, "", true);
            }  
        };
        that.recordKnownComponent = function (parent, component, name, created) {
            var parentPath = that.idToShadow[parent.id].path;
            var path = that.composePath(parentPath, name);
            recordComponent(component, path, created);
        };
        that.clearComponent = function (component, name, child, options, noModTree, path) {
            var record = that.idToShadow[component.id].path;
            // use flat recursion since we want to use our own recursion rather than rely on "visited" records
            options = options || {flat: true, instantiator: that};
            child = child || component[name];
            path = path || record;
            if (path === undefined) {
                fluid.fail("Cannot clear component " + name + " from component ", component, 
                    " which was not created by this instantiator"); 
            }
            fluid.fireEvent(child, "events.onClear", [child, name, component]);

            var childPath = that.composePath(path, name);
            var childRecord = that.idToShadow[child.id];

            // only recurse on components which were created in place - if the id record disagrees with the
            // recurse path, it must have been injected
            if (childRecord && childRecord.path === childPath) {
                fluid.fireEvent(child, "events.onDestroy", [child, name, component]);
                fluid.clearListeners(childRecord);
                fluid.visitComponentChildren(child, function(gchild, gchildname, newPath, parentPath) {
                    that.clearComponent(child, gchildname, null, options, true, parentPath);
                }, options, childPath);
                delete that.idToShadow[child.id];
                delete idToInstantiator[child.id];
            }
            delete that.pathToComponent[childPath]; // there may be no entry - if created informally
            if (!noModTree) {
                delete component[name]; // there may be no entry - if creation is not concluded
            }
        };
        return that;
    };
    
    // An instantiator to be used in the "free environment", unattached to any component tree
    fluid.freeInstantiator = fluid.instantiator(true);
    
    // Look up the globally registered instantiator for a particular component
    fluid.getInstantiator = function (component) {
        return component && idToInstantiator[component.id] || fluid.freeInstantiator;
    };
      
    /** Expand a set of component options either immediately, or with deferred effect.
     *  The current policy is to expand immediately function arguments within fluid.embodyDemands which are not the main options of a 
     *  component. The component's own options take <code>{defer: true}</code> as part of 
     *  <code>outerExpandOptions</code> which produces an "expandOptions" structure holding the "strategy" and "initter" pattern
     *  common to ginger participants.
     *  Probably not to be advertised as part of a public API, but is considerably more stable than most of the rest
     *  of the IoC API structure especially with respect to the first arguments.  
     */

    fluid.expandOptions = function (args, that, mergePolicy, localRecord, outerExpandOptions) {
        if (!args) {
            return args;
        }
        fluid.pushActivity("expandOptions", "expanding options %args for component %that ", {that: that, args: args});
        var expandOptions = fluid.makeStackResolverOptions(that, localRecord);
        expandOptions.mergePolicy = mergePolicy;
        var expanded = outerExpandOptions && outerExpandOptions.defer ? 
            fluid.makeExpandOptions(args, expandOptions) : fluid.expand(args, expandOptions);
        fluid.popActivity();
        return expanded;
    };
    
    // unsupported, non-API function    
    fluid.localRecordExpected = ["type", "options", "args", "mergeOptions", "createOnEvent", "priority", "recordType"]; // last element unavoidably polluting
    // unsupported, non-API function    
    fluid.checkComponentRecord = function (defaults, localRecord) {
        var expected = fluid.arrayToHash(fluid.localRecordExpected);
        fluid.each(defaults && defaults.argumentMap, function(value, key) {
            expected[key] = true;
        });
        fluid.each(localRecord, function (value, key) {
            if (!expected[key]) {
                fluid.fail("Probable error in subcomponent record - key \"" + key + 
                    "\" found, where the only legal options are " + 
                    fluid.keys(expected).join(", "));
            }  
        });
    };

    // unsupported, non-API function    
    fluid.pushDemands = function (list, demands) {
        demands = fluid.makeArray(demands);
        var thisp = fluid.mergeRecordTypes.demands;
        function push(rec) {
            rec.recordType = "demands";
            rec.priority = thisp++;
            list.push(rec);
        }
        // Assume these are sorted at source by intersect count (can't pre-merge if we want "mergeOptions")
        for (var i = 0; i < demands.length; ++ i) {
            var thisd = demands[i];
            if (thisd.options) {
                push(thisd);
            }
            else if (thisd.mergeOptions) {
                var mergeOptions = fluid.makeArray(thisd.mergeOptions);
                fluid.each(mergeOptions, function (record) { push ({options: record}); });
            }
            else {
                fluid.fail("Uninterpretable demands record without options or mergeOptions ", thisd);
            }
        }
    };
    
    // unsupported, non-API function
    fluid.mergeRecordsToList = function (mergeRecords) {
        var list = [];
        fluid.each(mergeRecords, function (value, key) {
            value.recordType = key;
            if (key === "distributions") {
                list.push.apply(list, value);
            }
            else if (key !== "demands") {
                if (!value.options) { return; }
                value.priority = fluid.mergeRecordTypes[key];
                if (value.priority === undefined) {
                    fluid.fail("Merge record with unrecognised type " + key + ": ", value); 
                }
                list.push(value);
            }
            else {
                fluid.pushDemands(list, value);
            }
        });
        return list; 
    };

    // TODO: overall efficiency could huge be improved by resorting to the hated PROTOTYPALISM as an optimisation
    // for this mergePolicy which occurs in every component. Although it is a deep structure, the root keys are all we need 
    var addPolicyBuiltins = function (policy) {
        fluid.each(["gradeNames", "mergePolicy", "argumentMap", "components", "dynamicComponents", "members", "invokers", "events", "listeners", "distributeOptions", "transformOptions"], function (key) {
            fluid.set(policy, [key, "*", "noexpand"], true);
        });
        return policy;
    };

    // unsupported, NON-API function - used from Fluid.js
    fluid.generateExpandBlock = function (record, that, mergePolicy, localRecord) {
        var expanded = fluid.expandOptions(record.options, record.contextThat || that, mergePolicy, localRecord, {defer: true});
        expanded.priority = record.priority;
        expanded.recordType = record.recordType;
        return expanded;
    };

    var expandComponentOptionsImpl = function (mergePolicy, defaults, userOptions, that) {
        var defaultCopy = fluid.copy(defaults);
        addPolicyBuiltins(mergePolicy);
        var shadow = fluid.shadowForComponent(that);
        shadow.mergePolicy = mergePolicy;
        var mergeRecords = {
            defaults: {options: defaultCopy}
        };
        
        if (userOptions) {
            if (userOptions.marker === fluid.EXPAND) {
                $.extend(mergeRecords, userOptions.mergeRecords);
                // Do this here for gradeless components that were corrected by "localOptions"
                if (mergeRecords.subcomponentRecord) {
                    fluid.checkComponentRecord(defaults, mergeRecords.subcomponentRecord);
                }
            }
            else {
                mergeRecords.user = {options: userOptions};
            }
        }
        var expandList = fluid.mergeRecordsToList(mergeRecords);

        var togo = fluid.transform(expandList, function (value) {
            return fluid.generateExpandBlock(value, that, mergePolicy, userOptions && userOptions.localRecord);
        });
        return togo;
    };

    // unsupported, non-API function
    fluid.expandComponentOptions = function (mergePolicy, defaults, userOptions, that) {
        var instantiator = userOptions && userOptions.marker === fluid.EXPAND && userOptions.memberName !== undefined ? 
            userOptions.instantiator : null;
        var fresh;
        if (!instantiator) {
            instantiator = fluid.instantiator();
            fresh = true;
            fluid.log("Created new instantiator with id " + instantiator.id + " in order to operate on component " + (that? that.typeName : "[none]"));
        }
        fluid.pushActivity("expandComponentOptions", "expanding component options %options with record %record for component %that", 
            {options: userOptions && userOptions.mergeRecords, record: userOptions, that: that});
        if (fresh) { 
            instantiator.recordRoot(that);
        }
        else {
            instantiator.recordKnownComponent(userOptions.parentThat, that, userOptions.memberName, true);
        }
        var togo = expandComponentOptionsImpl(mergePolicy, defaults, userOptions, that);
        fluid.popActivity();
        return togo;
    };
    
    // unsupported, non-API function
    fluid.argMapToDemands = function (argMap) {
        var togo = [];
        fluid.each(argMap, function (value, key) {
            togo[value] = "{" + key + "}";  
        });
        return togo;
    };
    
    // unsupported, non-API function
    fluid.makePassArgsSpec = function (initArgs) {
        return fluid.transform(initArgs, function(arg, index) {
            return "{arguments}." + index;
        });
    };

    // unsupported, NON-API function    
    fluid.pushDemandSpec = function (record, options, mergeOptions) {
        if (options && options !== "{options}") {
            record.push({options: options});
        }
        if (mergeOptions) {
            record.push({mergeOptions: mergeOptions});
        }
    };
    
    /** Given a concrete argument list and/or options, determine the final concrete
     * "invocation specification" which is coded by the supplied demandspec in the 
     * environment "thatStack" - the return is a package of concrete global function name
     * and argument list which is suitable to be executed directly by fluid.invokeGlobalFunction.
     */
    // unsupported, non-API function
    // options is just a disposition record containing memberName, componentRecord + passArgs
    // various built-in effects of this method 
    // i) note that it makes no effort to actually propagate direct
    // options from "initArgs", assuming that they will be seen again in expandComponentOptions
    fluid.embodyDemands = function (parentThat, demandspec, initArgs, options) {
        options = options || {};
        
        if (demandspec.mergeOptions && demandspec.options) {
            fluid.fail("demandspec ", demandspec, 
                    " is invalid - cannot specify literal options together with mergeOptions"); 
        }
        if (demandspec.transformOptions) { // Support for "transformOptions" at top level in a demands record
            demandspec.options = $.extend(true, {}, demandspec.options, {
                transformOptions: demandspec.transformOptions
            });
        }
        var demands = fluid.makeArray(demandspec.args);
        
        var upDefaults = fluid.defaults(demandspec.funcName);
        
        var distributions = upDefaults && parentThat ? fluid.receiveDistributions(parentThat, upDefaults.gradeNames, options.memberName) : [];
        
        var argMap = upDefaults? upDefaults.argumentMap : null;
        var inferMap = false;
        if (!argMap && (upDefaults || (options && options.componentRecord)) && !options.passArgs) {
            inferMap = true;
            // infer that it must be a little component if we have any reason to believe it is a component
            if (demands.length < 2) {
                argMap = fluid.rawDefaults("fluid.littleComponent").argumentMap;
            }
            else {
                var optionpos = $.inArray("{options}", demands);
                if (optionpos === -1) {
                    optionpos = demands.length - 1; // wild guess in the old style
                }
                argMap = {options: optionpos};
            }
        }
        options = options || {};
        if (demands.length === 0) {
            if (argMap) {
                demands = fluid.argMapToDemands(argMap);
            }
            else if (options.passArgs) {
                demands = fluid.makePassArgsSpec(initArgs);
            }
        }
        // confusion remains with "localRecord" - it is a random mishmash of user arguments and the component record
        // this should itself be absorbed into "mergeRecords" and let stackFetcher sort it out
        var localRecord = $.extend({"arguments": initArgs}, fluid.censorKeys(options.componentRecord, ["type"]));
        var shadow = fluid.shadowForComponent(parentThat);
        var localDynamic = shadow && options.memberName ? shadow.subcomponentLocal[options.memberName] : null;
        
        fluid.each(argMap, function (index, name) {
            // this is incorrect anyway! What if the supplied arguments were not in the same order as the target argmap,
            // which was obtained from the target defaults
            if (initArgs.length > 0) {
                localRecord[name] = localRecord["arguments"][index];
            }
            if (demandspec[name] !== undefined && localRecord[name] === undefined) {
                localRecord[name] = demandspec[name];
            }
            if (name !== "options") {
                for (var i = 0; i < distributions.length; ++ i) { // Apply non-options material from distributions (FLUID-5013)
                    if (distributions[i][name] !== undefined) {
                        localRecord[name] = distributions[i][name];
                    }
                }
            }
        });
        for (var i = 0; i < distributions.length; ++ i) {
            if (distributions[i].type !== undefined) {
                demandspec.funcName = distributions[i].type;
            }
        }
        
        var mergeRecords = {distributions: distributions};
        
        if (options.componentRecord !== undefined) {
            // Deliberately put too many things here so they can be checked in expandComponentOptions (FLUID-4285)
            mergeRecords.subcomponentRecord = $.extend({}, options.componentRecord);
        }
        var expandOptions = fluid.makeStackResolverOptions(parentThat, localRecord);
        var args = [];
        if (demands) {
            for (var i = 0; i < demands.length; ++i) {
                var arg = demands[i];
                // Weak detection since we cannot guarantee this material has not been copied
                if (fluid.isMarker(arg) && arg.value === fluid.COMPONENT_OPTIONS.value) {
                    arg = "{options}";
                    // Backwards compatibility for non-users of GRADES - last-ditch chance to correct the inference
                    if (inferMap) {
                        argMap = {options: i};
                    } 
                }
                if (typeof(arg) === "string") {
                    if (arg.charAt(0) === "@") {
                        var argpos = arg.substring(1);
                        arg = "{arguments}." + argpos;
                    }
                }
                if (!argMap || argMap.options !== i) {
                    // expand immediately if there can be no options or this is not the options
                    args[i] = fluid.expand(arg, expandOptions);
                }
                else { // It is the component options
                    if (typeof(arg) === "object" && !arg.targetTypeName) {
                        arg.targetTypeName = demandspec.funcName;
                    }
                    mergeRecords.demands = [];
                    fluid.each(demandspec.backSpecs.reverse(), function (backSpec) {
                        fluid.pushDemandSpec(mergeRecords.demands, backSpec.options, backSpec.mergeOptions);  
                    });
                    fluid.pushDemandSpec(mergeRecords.demands, demandspec.options || arg, demandspec.mergeOptions);
                    if (initArgs.length > 0) {
                        mergeRecords.user = {options: localRecord.options};
                    }
                    args[i] = {marker: fluid.EXPAND,
                               localRecord: localDynamic,
                               mergeRecords: mergeRecords,
                               instantiator: fluid.getInstantiator(parentThat),
                               parentThat: parentThat,
                               memberName: options.memberName};
                }
                if (args[i] && fluid.isMarker(args[i].marker, fluid.EXPAND_NOW)) {
                    args[i] = fluid.expand(args[i].value, expandOptions);
                }
            }
        }
        else {
            args = initArgs? initArgs : [];
        }

        var togo = {
            args: args,
            funcName: demandspec.funcName
        };
        return togo;
    };
    
    // NON-API function
    fluid.fabricateDestroyMethod = function (that, name, instantiator, child) {
        return function () {
            instantiator.clearComponent(that, name, child);
        };
    };
    
    /** Instantiate the subcomponent with the supplied name of the supplied top-level component. Although this method
     * is published as part of the Fluid API, it should not be called by general users and may not remain stable. It is
     * currently the only mechanism provided for instantiating components whose definitions are dynamic, and will be 
     * replaced in time by dedicated declarative framework described by FLUID-5022.
     * @param that {Component} the parent component for which the subcomponent is to be instantiated
     * @param name {String} the name of the component - the index of the options block which configures it as part of the
     * <code>components</code> section of its parent's options
     */
     // NB "directArgs" is now disused by the framework
    
    fluid.initDependent = function (that, name, directArgs) {
        if (that[name]) { return; } // TODO: move this into strategy
        directArgs = directArgs || [];
        var component = that.options.components[name];
        fluid.pushActivity("initDependent", "instantiating dependent component with name \"%name\" with record %record as child of %parent", 
            {name: name, record: component, parent: that});
        var instance;
        var instantiator = idToInstantiator[that.id];
        
        if (typeof(component) === "string") {
            instance = fluid.expandOptions(component, that);
            instantiator.recordKnownComponent(that, instance, name, false); 
        }
        else if (component.type) {
            var type = fluid.expandOptions(component.type, that);
            if (!type) {
                fluid.fail("Error in subcomponent record: ", component.type, " could not be resolved to a type for component ", name,
                    " of parent ", that);
            }
            var invokeSpec = fluid.resolveDemands(that, [type, name], directArgs, 
                {componentRecord: component, memberName: name});
            instance = fluid.initSubcomponentImpl(that, {type: invokeSpec.funcName}, invokeSpec.args);
            // The existing instantiator record will be provisional, adjust it to take account of the true return
            // TODO: Instantiator contents are generally extremely incomplete
            var path = instantiator.composePath(instantiator.idToPath(that.id), name);
            var existing = instantiator.pathToComponent[path];
            // This branch deals with the case where the component creator registered a component into "pathToComponent"
            // that does not agree with the component which was the return value. We need to clear out "pathToComponent" but
            // not shred the component since most of it is probably still valid
            if (existing && existing !== instance) {
                instantiator.clearComponent(that, name, existing);
            }
            if (instance && instance.typeName && instance.id && instance !== existing) {
                instantiator.recordKnownComponent(that, instance, name, true);
            }
            instance.destroy = fluid.fabricateDestroyMethod(that, name, instantiator, instance);
        }
        else {
            fluid.fail("Unrecognised material in place of subcomponent " + name + " - no \"type\" field found");
        }
        that[name] = instance;
        fluid.fireEvent(instance, "events.onAttach", [instance, name, that]);
        fluid.popActivity();
        return instance;
    };
    
    // unsupported, non-API function
    fluid.bindDeferredComponent = function (that, componentName, component) {
        var events = fluid.makeArray(component.createOnEvent);
        fluid.each(events, function(eventName) {
            var event = eventName.charAt(0) === "{" ? fluid.expandOptions(eventName, that) : that.events[eventName];
            event.addListener(function () {
                fluid.pushActivity("initDeferred", "instantiating deferred component %componentName of parent %that due to event %eventName",
                 {componentName: componentName, that: that, eventName: eventName});
                if (that[componentName]) {
                    var instantiator = idToInstantiator[that.id];
                    instantiator.clearComponent(that, componentName);
                }
                fluid.initDependent(that, componentName);
                fluid.popActivity();
            }, null, null, component.priority);
        });
    };
    
    // unsupported, non-API function
    fluid.priorityForComponent = function (component) {
        return component.priority? component.priority : 
            (component.type === "fluid.typeFount" || fluid.hasGrade(fluid.defaults(component.type), "fluid.typeFount"))?
            "first" : undefined;  
    };
    
    fluid.initDependents = function (that) {
        fluid.pushActivity("initDependents", "instantiating dependent components for component %that", {that: that});
        var shadow = fluid.shadowForComponent(that);
        shadow.memberStrategy.initter();
        
        var options = that.options;
        var components = options.components || {};
        var componentSort = {};

        fluid.each(components, function (component, name) {
            if (!component.createOnEvent) {
                var priority = fluid.priorityForComponent(component);
                componentSort[name] = {key: name, priority: fluid.event.mapPriority(priority, 0)};
            }
            else {
                fluid.bindDeferredComponent(that, name, component);
            }
        });
        var componentList = fluid.event.sortListeners(componentSort);
        fluid.each(componentList, function (entry) {
            fluid.initDependent(that, entry.key);  
        });

        shadow.invokerStrategy.initter();
        fluid.popActivity();
    };   
   
    var dependentStore = {};
    
    function searchDemands (demandingName, contextNames) {
        var exist = dependentStore[demandingName] || [];
outer:  for (var i = 0; i < exist.length; ++i) {
            var rec = exist[i];
            for (var j = 0; j < contextNames.length; ++j) {
                if (rec.contexts[j] !== contextNames[j]) {
                    continue outer;
                }
            }
            return rec.spec; // jslint:ok
        }
    }
    
    var isDemandLogging = false;
    fluid.setDemandLogging = function (set) {
        isDemandLogging = set;  
    };
    
    // unsupported, non-API function
    fluid.isDemandLogging = function (demandingNames) {
        return isDemandLogging && fluid.isLogging();
    };
    
    fluid.demands = function (demandingName, contextName, spec) {
        var contextNames = fluid.makeArray(contextName).sort(); 
        if (!spec) {
            return searchDemands(demandingName, contextNames);
        }
        else if (spec.length) {
            spec = {args: spec};
        }
        if (fluid.getCallerInfo && fluid.isDemandLogging()) {
            var callerInfo = fluid.getCallerInfo(5);
            if (callerInfo) {
                spec.registeredFrom = callerInfo;
            }
        }
        spec.demandId = fluid.allocateGuid();
        var exist = dependentStore[demandingName];
        if (!exist) {
            exist = [];
            dependentStore[demandingName] = exist;
        }
        exist.push({contexts: contextNames, spec: spec});
    };

    // unsupported, non-API function
    fluid.compareDemands = function (speca, specb) {
        return specb.intersect - speca.intersect;
    };
    
    // unsupported, non-API function
    fluid.locateAllDemands = function (parentThat, demandingNames) {
        var demandLogging = fluid.isDemandLogging(demandingNames);
        if (demandLogging) {
            fluid.log("Resolving demands for function names ", demandingNames, " in context of " +
                (parentThat? "component " + parentThat.typeName : "no component"));
        }
        
        var contextNames = {};
        var visited = [];
        var instantiator = fluid.getInstantiator(parentThat);
        var thatStack = instantiator.getFullStack(parentThat);
        visitComponents(instantiator, thatStack, function (component, xname, path, xpath, depth) {
            // NB - don't use shadow's cache here because we allow fewer names for demand resolution than for value resolution
            contextNames[component.typeName] = depth;
            var gradeNames = fluid.makeArray(fluid.get(component, ["options", "gradeNames"]));
            fluid.each(gradeNames, function (gradeName) {
                contextNames[gradeName] = depth;  
            });
            visited.push(component);
        });
        if (demandLogging) {
            fluid.log("Components in scope for resolution:\n" + fluid.dumpThatStack(visited, instantiator));  
        }
        var matches = [];
        for (var i = 0; i < demandingNames.length; ++i) {
            var rec = dependentStore[demandingNames[i]] || [];
            for (var j = 0; j < rec.length; ++j) {
                var spec = rec[j];
                var horizonLevel = spec.spec.horizon ? contextNames[spec.spec.horizon] : -1;
                var record = {spec: spec, intersect: 0, uncess: 0};
                for (var k = 0; k < spec.contexts.length; ++k) {
                    var depth = contextNames[spec.contexts[k]]; 
                    record[depth !== undefined && depth >= horizonLevel ? "intersect" : "uncess"] += 2;
                }
                if (spec.contexts.length === 0) { // allow weak priority for contextless matches
                    record.intersect++;
                }
                if (record.uncess === 0) {
                    matches.push(record);
                } 
            }
        }
        matches.sort(fluid.compareDemands);
        return matches;   
    };

    // unsupported, non-API function
    fluid.locateDemands = function (parentThat, demandingNames) {
        var matches = fluid.locateAllDemands(parentThat, demandingNames);
        var demandspec = fluid.getMembers(matches, ["spec", "spec"]);
        if (fluid.isDemandLogging(demandingNames)) {
            if (demandspec.length) {
                fluid.log("Located " + matches.length + " potential match" + (matches.length === 1? "" : "es") + ", selected best match with " + matches[0].intersect 
                    + " matched context names: ", demandspec);
            }
            else {
                fluid.log("No matches found for demands, using direct implementation");
            }
        }  
        return demandspec;
    };
    
    /** Determine the appropriate demand specification held in the fluid.demands environment 
     * relative the supplied component position for the function name(s) funcNames.
     */
    // unsupported, non-API function
    fluid.determineDemands = function (parentThat, funcNames) {
        funcNames = fluid.makeArray(funcNames);
        var newFuncName = funcNames[0];
        var demandspec = fluid.locateDemands(parentThat, funcNames);
        if (demandspec.length && demandspec[0].funcName) {
            newFuncName = demandspec[0].funcName;
        }
        
        return $.extend(true, {funcName: newFuncName, 
                                args: demandspec[0] ? fluid.makeArray(demandspec[0].args) : [],
                                backSpecs: demandspec.slice(1)
                                },
            fluid.censorKeys(demandspec[0], ["funcName", "args"]));
    };
    // "options" includes - passArgs, componentRecord, memberName (latter two from initDependent route)
    // unsupported, non-API function
    fluid.resolveDemands = function (parentThat, funcNames, initArgs, options) {
        var demandspec = fluid.determineDemands(parentThat, funcNames);
        return fluid.embodyDemands(parentThat, demandspec, initArgs, options);
    };
    
    // Convert a record which may harbour a "this/method" pair into an object which mocks the function.apply operation, pre-bound (for FLUID-4878)
    // unsupported, non-API function
    fluid.recordToApplicable = function (record, that) {
        var recthis = record["this"];
        if (record.method ^ recthis) {
            fluid.fail("Record ", that, " must contain both entries \"method\" and \"this\" if it contains either");
        }
        if (!record.method) {
           return null;
        }
        return {
            apply: function (noThis, args) {
                // Resolve this material late, to deal with cases where the target has only just been brought into existence
                // (e.g. a jQuery target for rendered material) - TODO: Possibly implement cached versions of these as we might do for invokers
                var resolvedThis = fluid.expandOptions(recthis, that);
                if (typeof(resolvedThis) === "string") {
                    resolvedThis = fluid.getGlobalValue(resolvedThis);
                }
                if (!resolvedThis) {
                    fluid.fail("Could not resolve reference " + recthis + " to a value"); 
                }
                var resolvedFunc = resolvedThis[record.method];
                if (typeof(resolvedFunc) !== "function") {
                    fluid.fail("Object ", resolvedThis, " at reference " + recthis + " has no member named " + record.method + " which is a function ");
                }
                fluid.log("Applying arguments ", args, " to method " + record.method + " of instance ", resolvedThis);
                return resolvedFunc.apply(resolvedThis, args);
            }
        };
    };
    
    // TODO: make a *slightly* more performant version of fluid.invoke that perhaps caches the demands
    // after the first successful invocation
    fluid.invoke = function (functionName, args, that, environment) {
        fluid.pushActivity("invokeFunc", "invoking function with name \"%functionName\" from component %that", {functionName: functionName, that: that});
        var invokeSpec = fluid.resolveDemands(that, functionName, fluid.makeArray(args), {passArgs: true});
        var togo = fluid.invokeGlobalFunction(invokeSpec.funcName, invokeSpec.args, environment);
        fluid.popActivity();
        return togo;
    };
    
    /** Make a function which performs only "static redispatch" of the supplied function name - 
     * that is, taking only account of the contents of the "static environment". Since the static
     * environment is assumed to be constant, the dispatch of the call will be evaluated at the
     * time this call is made, as an optimisation.
     */
    // unsupported, non-API function    
    fluid.makeFreeInvoker = function (functionName, environment) {
        var demandSpec = fluid.determineDemands(null, functionName);
        return function () {
            var invokeSpec = fluid.embodyDemands(null, demandSpec, fluid.makeArray(arguments), {passArgs: true});
            return fluid.invokeGlobalFunction(invokeSpec.funcName, invokeSpec.args, environment);
        };
    };
    
    // unsupported, non-API function
    fluid.makeInvoker = function (that, invokerec, name, environment) {
        var functionName;
        if (typeof(invokerec) === "string") {
            if (invokerec.charAt(0) === "{") { // shorthand case for direct function invokers (FLUID-4926)
                invokerec = {func: invokerec};
            } else {
                functionName = invokerec;
            }
        }
        var demandspec = functionName? fluid.determineDemands(that, functionName) : invokerec;
        return function () {
            fluid.pushActivity("invokeInvoker", "invoking invoker with name %name and record %record from component %that", {name: name, record: invokerec, that: that});
            var func = fluid.recordToApplicable(invokerec, that);
            var args = fluid.makeArray(arguments);
            var invokeSpec = fluid.embodyDemands(that, demandspec, args, {passArgs: true});
            func = func || (invokeSpec.funcName? fluid.getGlobalValue(invokeSpec.funcName, environment)
                : fluid.expandOptions(demandspec.func, that));
            if (!func) {
                fluid.fail("Error in invoker record: could not resolve members func, funcName or method to a function implementation", demandspec);
            }
            var togo = func.apply(null, invokeSpec.args);
            fluid.popActivity();
            return togo;
        };
    };
    
    // unsupported, non-API function
    // weird higher-order function so that we can staightforwardly dispatch original args back onto listener   
    fluid.event.makeTrackedListenerAdder = function (source) {
        var shadow = fluid.shadowForComponent(source);
        return function (event) {
            return {addListener: function(listener) {
                    fluid.recordListener(event, listener, shadow);
                    event.addListener.apply(null, arguments);
                }
            }
        };
    };

    // unsupported, non-API function    
    fluid.event.listenerEngine = function (eventSpec, callback, adder) {
        var argstruc = {};
        function checkFire() {
            var notall = fluid.find(eventSpec, function(value, key) {
                if (argstruc[key] === undefined) {
                    return true;
                }  
            });
            if (!notall) {
                callback(argstruc);
                fluid.clear(argstruc);
            }
        }
        fluid.each(eventSpec, function (event, eventName) {
            adder(event).addListener(function () {
                argstruc[eventName] = fluid.makeArray(arguments);
                checkFire();
            });
        });
    };
    
    // unsupported, non-API function
    fluid.event.dispatchListener = function (that, listener, eventName, eventSpec, indirectArgs) {
        return function () {
            fluid.pushActivity("dispatchListener", "firing to listener to event named %eventName of component %that", 
                {eventName: eventName, that: that});
            if (typeof(listener) === "string") {
                listener = fluid.event.resolveListener({globalName: listener}); // just resolves globals
            }
            var args = indirectArgs? arguments[0] : fluid.makeArray(arguments);
            var demandspec = fluid.determineDemands(that, eventName); // TODO: This name may contain a namespace
            if (demandspec.args.length === 0 && eventSpec.args) {
                demandspec.args = eventSpec.args;
            }
            var resolved = fluid.embodyDemands(that, demandspec, args, {passArgs: true});
            var togo = listener.apply(null, resolved.args);
            fluid.popActivity();  
            return togo;
        };
    };
    
    // unsupported, non-API function
    fluid.event.resolveListenerRecord = function (lisrec, that, eventName) {
        var badRec = function (record, extra) {
            fluid.fail("Error in listener record - could not resolve reference ", record, " to a listener or firer. "
                    + "Did you miss out \"events.\" when referring to an event firer?" + extra);
        };
        fluid.pushActivity("resolveListenerRecord", "resolving listener record for event named %eventName for component %that",
            {eventName: eventName, that: that});
        var records = fluid.makeArray(lisrec);
        var transRecs = fluid.transform(records, function (record) {
            var expanded = fluid.isPrimitive(record) || record.expander ? {listener: record} : record;
            var methodist = fluid.recordToApplicable(record, that);
            if (methodist) {
                expanded.listener = methodist;
            }
            else {
                expanded.listener = expanded.listener || expanded.func || expanded.funcName;
            }
            if (!expanded.listener) {
                badRec(record, " Listener record must contain a member named \"listener\" or \"method\"");
            }
            var listener = expanded.listener = fluid.expandOptions(expanded.listener, that);
            if (!listener) {
                badRec(record, "");
            }
            var firer;
            if (listener.typeName === "fluid.event.firer") {
                listener = listener.fire;
                firer = true;
            }
            expanded.listener = expanded.args || firer ? fluid.event.dispatchListener(that, listener, eventName, expanded) : listener;
            return expanded;
        });
        var togo = {
            records: transRecs,
            adderWrapper: fluid.event.makeTrackedListenerAdder(that)
        };
        fluid.popActivity();
        return togo;
    };
    
    // unsupported, non-API function
    fluid.event.expandOneEvent = function (that, event) {
        var origin;
        if (typeof(event) === "string" && event.charAt(0) !== "{") {
            // Shorthand for resolving onto our own events, but with GINGER WORLD!
            origin = fluid.getForComponent(that, ["events", event]);
        }
        else {
            origin = fluid.expandOptions(event, that);
        }
        if (!origin || origin.typeName !== "fluid.event.firer") {
            fluid.fail("Error in event specification - could not resolve base event reference ", event, " to an event firer: got ", origin);
        }
        return origin;
    };

    // unsupported, non-API function    
    fluid.event.expandEvents = function (that, event) {
        return typeof(event) === "string" ?
            fluid.event.expandOneEvent(that, event) :
            fluid.transform(event, function (oneEvent) {
                return fluid.event.expandOneEvent(that, oneEvent);
            });
    };
    
    // unsupported, non-API function
    fluid.event.resolveEvent = function (that, eventName, eventSpec) {
        fluid.pushActivity("resolveEvent", "resolving event with name %eventName attached to component %that", 
            {eventName: eventName, that: that});
        var adder = fluid.event.makeTrackedListenerAdder(that);
        if (typeof(eventSpec) === "string") {
            eventSpec = {event: eventSpec};
        }
        var event = eventSpec.event || eventSpec.events;
        if (!event) {
            fluid.fail("Event specification for event with name " + eventName + " does not include a base event specification: ", eventSpec);
        }
        
        var origin = fluid.event.expandEvents(that, event);

        var isMultiple = origin.typeName !== "fluid.event.firer";
        var isComposite = eventSpec.args || isMultiple;
        // If "event" is not composite, we want to share the listener list and FIRE method with the original
        // If "event" is composite, we need to create a new firer. "composite" includes case where any boiling
        // occurred - this was implemented wrongly in 1.4.
        var firer;
        if (isComposite) {
            firer = fluid.event.getEventFirer(null, null, " [composite] " + fluid.event.nameEvent(that, eventName));
            var dispatcher = fluid.event.dispatchListener(that, firer.fire, eventName, eventSpec, isMultiple);
            if (isMultiple) {
                fluid.event.listenerEngine(origin, dispatcher, adder);
            }
            else {
                adder(origin).addListener(dispatcher);
            }
        }
        else {
            firer = {typeName: "fluid.event.firer"}; // jslint:ok - already defined
            firer.fire = function () {
                var outerArgs = fluid.makeArray(arguments);
                fluid.pushActivity("fireSynthetic", "firing synthetic event %eventName ", {eventName: eventName});  
                var togo = origin.fire.apply(null, outerArgs);
                fluid.popActivity();
                return togo;
            };
            firer.addListener = function (listener, namespace, predicate, priority) {
                var dispatcher = fluid.event.dispatchListener(that, listener, eventName, eventSpec);
                adder(origin).addListener(dispatcher, namespace, predicate, priority);
            };
            firer.removeListener = function (listener) {
                origin.removeListener(listener);
            };
        }
        fluid.popActivity();
        return firer;
    };

    /** BEGIN unofficial IoC material **/
    // Although the following three functions are unsupported and not part of the IoC
    // implementation proper, they are still used in the renderer
    // expander as well as in some old-style tests and various places in CSpace.
    
    // unsupported, non-API function
    fluid.withEnvironment = function (envAdd, func, root) {
        root = root || fluid.globalThreadLocal();
        return fluid.tryCatch(function() {
            for (var key in envAdd) {
                root[key] = envAdd[key];
            }
            $.extend(root, envAdd);
            return func();
        }, null, function() {
            for (var key in envAdd) { // jslint:ok duplicate "value"
                delete root[key]; // TODO: users may want a recursive "scoping" model
            }
        });
    };
    
    // unsupported, NON-API function    
    fluid.fetchContextReference = function (parsed, directModel, env, elResolver, externalFetcher) {
        // The "elResolver" is a hack to make certain common idioms in protoTrees work correctly, where a contextualised EL
        // path actually resolves onto a further EL reference rather than directly onto a value target 
        if (elResolver) {
            parsed = elResolver(parsed, env);
        }
        var base = parsed.context? env[parsed.context] : directModel;
        if (!base) {
            var resolveExternal = externalFetcher && externalFetcher(parsed);
            return resolveExternal || base;
        }
        return parsed.noDereference? parsed.path : fluid.get(base, parsed.path);
    };
    
    // unsupported, non-API function  
    fluid.makeEnvironmentFetcher = function (directModel, elResolver, envGetter, externalFetcher) {
        envGetter = envGetter || fluid.globalThreadLocal;
        return function(parsed) {
            var env = envGetter();
            return fluid.fetchContextReference(parsed, directModel, env, elResolver, externalFetcher);
        };
    };
    
    /** END of unofficial IoC material **/

    // unsupported, non-API function  
    fluid.extractEL = function (string, options) {
        if (options.ELstyle === "ALL") {
            return string;
        }
        else if (options.ELstyle.length === 1) {
            if (string.charAt(0) === options.ELstyle) {
                return string.substring(1);
            }
        }
        else if (options.ELstyle === "${}") {
            var i1 = string.indexOf("${");
            var i2 = string.lastIndexOf("}");
            if (i1 === 0 && i2 !== -1) {
                return string.substring(2, i2);
            }
        }
    };
    
    // unsupported, non-API function
    fluid.extractELWithContext = function (string, options) {
        var EL = fluid.extractEL(string, options);
        if (EL && EL.charAt(0) === "{") {
            return fluid.parseContextReference(EL);
        }
        return EL? {path: EL} : EL;
    };

    fluid.parseContextReference = function (reference, index, delimiter) {
        index = index || 0;
        var endcpos = reference.indexOf("}", index + 1);
        if (endcpos === -1) {
            fluid.fail("Cannot parse context reference \"" + reference + "\": Malformed context reference without }");
        }
        var context = reference.substring(index + 1, endcpos);
        var endpos = delimiter? reference.indexOf(delimiter, endcpos + 1) : reference.length;
        var path = reference.substring(endcpos + 1, endpos);
        if (path.charAt(0) === ".") {
            path = path.substring(1);
        }
        return {context: context, path: path, endpos: endpos};
    };
    
    fluid.renderContextReference = function (parsed) {
        return "{" + parsed.context + "}." + parsed.path;  
    };
    
    // unsupported, non-API function
    fluid.resolveContextValue = function (string, options) {
        function fetch(parsed) {
            fluid.pushActivity("resolveContextValue", "resolving context value %string", {string: string});
            var togo = options.fetcher(parsed);
            fluid.pushActivity("resolvedContextValue", "resolved value %string to value %value", {string: string, value: togo});
            fluid.popActivity(2);
            return togo;
        }
        if (options.bareContextRefs && string.charAt(0) === "{") {
            var parsed = fluid.parseContextReference(string);
            return fetch(parsed);        
        }
        else if (options.ELstyle && options.ELstyle !== "${}") {
            var parsed = fluid.extractELWithContext(string, options); // jslint:ok, redefinition
            if (parsed) {
                return fetch(parsed);
            }
        }
        while (typeof(string) === "string") {
            var i1 = string.indexOf("${");
            var i2 = string.indexOf("}", i1 + 2);
            if (i1 !== -1 && i2 !== -1) {
                var parsed; // jslint:ok
                if (string.charAt(i1 + 2) === "{") {
                    parsed = fluid.parseContextReference(string, i1 + 2, "}");
                    i2 = parsed.endpos;
                }
                else {
                    parsed = {path: string.substring(i1 + 2, i2)};
                }
                var subs = fetch(parsed);
                var all = (i1 === 0 && i2 === string.length - 1); 
                // TODO: test case for all undefined substitution
                if (subs === undefined || subs === null) {
                    return subs;
                }
                string = all? subs : string.substring(0, i1) + subs + string.substring(i2 + 1);
            }
            else {
                break;
            }
        }
        return string;
    };

    // unsupported, NON-API function
    fluid.expandExpander = function (target, source, options) {
        var expander = fluid.getGlobalValue(source.expander.type || "fluid.deferredInvokeCall");  
        if (expander) {
            return expander.call(null, target, source, options);
        }
    };
    
    // This function appears somewhat reusable, but not entirely - it probably needs to be packaged
    // along with the particular "strategy". Very similar to the old "filter"... the "outer driver" needs
    // to execute it to get the first recursion going at top level. This was one of the most odd results
    // of the reorganisation, since the "old work" seemed much more naturally expressed in terms of values
    // and what happened to them. The "new work" is expressed in terms of paths and how to move amongst them.
    fluid.fetchExpandChildren = function (target, source, mergePolicy, miniWorld, options) {
        if (source.expander /* && source.expander.type */) { // possible expander at top level
            var expanded = fluid.expandExpander(target, source, options);
            if (fluid.isPrimitive(expanded) || fluid.isDOMish(expanded) || (fluid.isArrayable(expanded) ^ fluid.isArrayable(target))) {
                return expanded;
            }
            else { // make an attempt to preserve the root reference if possible
                $.extend(true, target, expanded);
            }
        }
        // NOTE! This expects that RHS is concrete! For material input to "expansion" this happens to be the case, but is not
        // true for other algorithms. Inconsistently, this algorithm uses "sourceStrategy" below. In fact, this "fetchChildren"
        // operation looks like it is a fundamental primitive of the system. We do call "deliverer" early which enables correct
        // reference to parent nodes up the tree - however, anyone processing a tree IN THE CHAIN requires that it is produced
        // concretely at the point STRATEGY returns. Which in fact it is...............
        fluid.each(source, function (newSource, key) {
            if (newSource === undefined) {
                target[key] = undefined; // avoid ever dispatching to ourselves with undefined source
            }
            else { // Don't bother to generate segs or i in direct dispatch to self!!!!!!
                options.strategy(target, key, null, null, source, mergePolicy, miniWorld);
            }
        });
        return target;
    };
    
    // TODO: This method is unnecessary and will quadratic inefficiency if RHS block is not concrete. 
    // The driver should detect "homogeneous uni-strategy trundling" and agree to preserve the extra 
    // "cursor arguments" which should be advertised somehow (at least their number)
    function regenerateCursor (source, segs, limit, sourceStrategy) {
        for (var i = 0; i < limit; ++ i) {
            source = sourceStrategy(source, segs[i], i, segs);
        }
        return source;
    }

    // unsupported, NON-API function    
    fluid.isUnexpandable = function (source) {
        return fluid.isPrimitive(source) || source.nodeType !== undefined || source.jquery;
    };
    
    // unsupported, NON-API function
    fluid.guardCircularity = function (seenIds, source, message1, message2) {
        if (source && source.id) {
            if (!seenIds[source.id]) {
                seenIds[source.id] = source;
            } else if (seenIds[source.id] === source) {
                fluid.fail("Circularity in options " + message1 + " - " + fluid.nameComponent(source)
                    + " has already been seen" + message2);
            }
        }
    };

    // unsupported, NON-API function    
    fluid.expandSource = function (options, target, deliverer, source, policy, miniWorld, recurse) {
        var expanded, isTrunk, isLate;
        var thisPolicy = fluid.derefMergePolicy(policy);
        fluid.guardCircularity(options.seenIds, source, "expansion", 
             " - please ensure options are not circularly connected, or protect from expansion using the \"noexpand\" policy or expander");
        if (typeof (source) === "string" && !thisPolicy.noexpand) {
            expanded = fluid.resolveContextValue(source, options);
        }
        else if (thisPolicy.noexpand || fluid.isUnexpandable(source)) {
            expanded = source;
        }
        else if (source.expander) {
            expanded = fluid.expandExpander(deliverer, source, options);
        }
        else {
            if (thisPolicy.preserve) {
                expanded = source;
                isLate = true;
            }
            else {
                expanded = fluid.freshContainer(source);
            }
            isTrunk = true;
        }
        if (!isLate && expanded !== fluid.NO_VALUE) {
            deliverer(expanded);
        }
        if (isTrunk) {
            recurse(expanded, source, policy, miniWorld || isLate);
        }
        if (isLate && expanded !== fluid.NO_VALUE) {
            deliverer(expanded);
        }
        return expanded;
    };

    // unsupported, NON-API function    
    fluid.makeExpandStrategy = function (options) {
        var recurse = function (target, source, policy, miniWorld) {
            return fluid.fetchExpandChildren(target, source, policy, miniWorld, options);
        };
        var strategy = function (target, name, i, segs, source, policy, miniWorld) {
            if (!target) {
                return;
            }
            if (!miniWorld && target.hasOwnProperty(name)) { // bail out if our work has already been done
                return target[name];
            }
            if (name === "expander" && source && source.expander.type) { // must be direct dispatch from fetchChildren
                return;
            }
            if (source === undefined) { // recover our state in case this is an external entry point
                source = regenerateCursor(options.source, segs, i - 1, options.sourceStrategy);
                policy = regenerateCursor(options.mergePolicy, segs, i - 1, fluid.concreteTrundler);
            }
            var thisSource = options.sourceStrategy(source, name, i, segs);
            var thisPolicy = fluid.concreteTrundler(policy, name);
            function deliverer(value) {
                target[name] = value;
            }
            
            return fluid.expandSource(options, target, deliverer, thisSource, thisPolicy, miniWorld, recurse);
        };
        options.recurse = recurse;
        options.strategy = strategy;
        return strategy;
    };
    
    fluid.defaults("fluid.makeExpandOptions", {
        ELstyle:          "${}",
        bareContextRefs:  true,
        target:           fluid.inCreationMarker
    });

    // unsupported, NON-API function    
    fluid.makeExpandOptions = function (source, options) {
        options = $.extend({}, fluid.rawDefaults("fluid.makeExpandOptions"), options);
        options.expandSource = function (source) {
            return fluid.expandSource(options, null, fluid.identity, source, options.mergePolicy, false);
        };
        if (!fluid.isUnexpandable(source)) {
            options.source = source;
            options.seenIds = {};
            options.target = fluid.freshContainer(source);
            options.sourceStrategy = options.sourceStrategy || fluid.concreteTrundler;
            fluid.makeExpandStrategy(options);
            options.initter = function () {
                options.target = fluid.fetchExpandChildren(options.target, options.source, options.mergePolicy, false, options);
            };
        }
        else { // these init immediately since we must deliver a valid root target
            options.strategy = fluid.concreteTrundler;
            options.initter = fluid.identity;
            if (typeof(source) === "string") {
                options.target = options.expandSource(source);
            }
            else {
                options.target = source;
            }
        }
        return options;
    };
    
    fluid.expand = function (source, options) {
        var expandOptions = fluid.makeExpandOptions(source, options);
        expandOptions.initter();
        return expandOptions.target;
    };
      
    fluid.registerNamespace("fluid.expander");
            
    /** "light" expanders, starting with support functions for the so-called "deferredCall" expanders,
         which make an arbitrary function call (after expanding arguments) and are then replaced in
         the configuration with the call results. These will probably be abolished and replaced with
         equivalent model transformation machinery **/

    fluid.expander.deferredCall = function (deliverer, source, options) {
        var expander = source.expander;
        var args = (!expander.args || fluid.isArrayable(expander.args))? expander.args : fluid.makeArray(expander.args);
        args = options.recurse([], args); 
        return fluid.invokeGlobalFunction(expander.func, args);
    };
    
    fluid.deferredCall = fluid.expander.deferredCall; // put in top namespace for convenience
    
    // This one is now positioned as the "universal expander" - default if no type supplied
    fluid.deferredInvokeCall = function (deliverer, source, options) {
        var expander = source.expander;
        var args = fluid.makeArray(expander.args);
        args = options.recurse([], args); // TODO: risk of double expansion here. embodyDemands will sometimes expand, sometimes not...
        var funcEntry = expander.func || expander.funcName; 
        var func = options.expandSource(funcEntry) || fluid.recordToApplicable(expander, options.contextThat);
        if (!func) {
            fluid.fail("Error in expander record - " + funcEntry + " could not be resolved to a function for component ", options.contextThat);
        }
        return func.apply ? func.apply(null, args) : fluid.invoke(func, args, options.contextThat);
    };
    
    // The "noexpand" expander which simply unwraps one level of expansion and ceases.
    fluid.expander.noexpand = function (deliverer, source) {
        return source.expander.value ? source.expander.value : source.expander.tree;
    };
  
    fluid.noexpand = fluid.expander.noexpand; // TODO: check naming and namespacing

          
})(jQuery, fluid_1_5);
/*
Copyright 2010-2011 OCAD University
Copyright 2010-2011 Lucendo Development Ltd.

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global fluid_1_5:true, jQuery*/

// JSLint options 
/*jslint white: true, funcinvoke: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

var fluid_1_5 = fluid_1_5 || {};

(function ($, fluid) {

    /** Framework-global caching state for fluid.fetchResources **/

    var resourceCache = {};
  
    var pendingClass = {};
 
    /** Accepts a hash of structures with free keys, where each entry has either
     * href/url or nodeId set - on completion, callback will be called with the populated
     * structure with fetched resource text in the field "resourceText" for each
     * entry. Each structure may contain "options" holding raw options to be forwarded
     * to jQuery.ajax().
     */
  
    fluid.fetchResources = function(resourceSpecs, callback, options) {
        var that = fluid.initLittleComponent("fluid.fetchResources", options);
        that.resourceSpecs = resourceSpecs;
        that.callback = callback;
        that.operate = function() {
            fluid.fetchResources.fetchResourcesImpl(that);
        };
        fluid.each(resourceSpecs, function(resourceSpec, key) {
             resourceSpec.recurseFirer = fluid.event.getEventFirer(null, null, "I/O completion for resource \"" + key + "\"");
             resourceSpec.recurseFirer.addListener(that.operate);
             if (resourceSpec.url && !resourceSpec.href) {
                resourceSpec.href = resourceSpec.url;
             }
        });
        if (that.options.amalgamateClasses) {
            fluid.fetchResources.amalgamateClasses(resourceSpecs, that.options.amalgamateClasses, that.operate);
        }
        that.operate();
        return that;
    };
  
    /*
     * This function is unsupported: It is not really intended for use by implementors.
     */
    // Add "synthetic" elements of *this* resourceSpec list corresponding to any
    // still pending elements matching the PROLEPTICK CLASS SPECIFICATION supplied 
    fluid.fetchResources.amalgamateClasses = function(specs, classes, operator) {
        fluid.each(classes, function(clazz) {
            var pending = pendingClass[clazz];
            fluid.each(pending, function(pendingrec, canon) {
                specs[clazz+"!"+canon] = pendingrec;
                pendingrec.recurseFirer.addListener(operator);
            });
        });
    };
  
    /*
     * This function is unsupported: It is not really intended for use by implementors.
     */
    fluid.fetchResources.timeSuccessCallback = function(resourceSpec) {
        if (resourceSpec.timeSuccess && resourceSpec.options && resourceSpec.options.success) {
            var success = resourceSpec.options.success;
            resourceSpec.options.success = function() {
            var startTime = new Date();
            var ret = success.apply(null, arguments);
            fluid.log("External callback for URL " + resourceSpec.href + " completed - callback time: " + 
                    (new Date().getTime() - startTime.getTime()) + "ms");
            return ret;
            };
        }
    };
    
    // TODO: Integrate punch-through from old Engage implementation
    function canonUrl(url) {
        return url;
    }
    
    fluid.fetchResources.clearResourceCache = function(url) {
        if (url) {
            delete resourceCache[canonUrl(url)];
        }
        else {
            fluid.clear(resourceCache);
        }  
    };
  
    /*
     * This function is unsupported: It is not really intended for use by implementors.
     */
    fluid.fetchResources.handleCachedRequest = function(resourceSpec, response) {
         var canon = canonUrl(resourceSpec.href);
         var cached = resourceCache[canon];
         if (cached.$$firer$$) {
             fluid.log("Handling request for " + canon + " from cache");
             var fetchClass = resourceSpec.fetchClass;
             if (fetchClass && pendingClass[fetchClass]) {
                 fluid.log("Clearing pendingClass entry for class " + fetchClass);
                 delete pendingClass[fetchClass][canon];
             }
             resourceCache[canon] = response;      
             cached.fire(response);
         }
    };
    
    /*
     * This function is unsupported: It is not really intended for use by implementors.
     */
    fluid.fetchResources.completeRequest = function(thisSpec, recurseCall) {
        thisSpec.queued = false;
        thisSpec.completeTime = new Date();
        fluid.log("Request to URL " + thisSpec.href + " completed - total elapsed time: " + 
            (thisSpec.completeTime.getTime() - thisSpec.initTime.getTime()) + "ms");
        thisSpec.recurseFirer.fire();
    };
  
    /*
     * This function is unsupported: It is not really intended for use by implementors.
     */
    fluid.fetchResources.makeResourceCallback = function(thisSpec) {
        return {
            success: function(response) {
                thisSpec.resourceText = response;
                thisSpec.resourceKey = thisSpec.href;
                if (thisSpec.forceCache) {
                    fluid.fetchResources.handleCachedRequest(thisSpec, response);
                }
                fluid.fetchResources.completeRequest(thisSpec);
            },
            error: function(response, textStatus, errorThrown) {
                thisSpec.fetchError = {
                    status: response.status,
                    textStatus: response.textStatus,
                    errorThrown: errorThrown
                };
                fluid.fetchResources.completeRequest(thisSpec);
            }
            
        };
    };
    
        
    /*
     * This function is unsupported: It is not really intended for use by implementors.
     */
    fluid.fetchResources.issueCachedRequest = function(resourceSpec, options) {
         var canon = canonUrl(resourceSpec.href);
         var cached = resourceCache[canon];
         if (!cached) {
             fluid.log("First request for cached resource with url " + canon);
             cached = fluid.event.getEventFirer(null, null, "cache notifier for resource URL " + canon);
             cached.$$firer$$ = true;
             resourceCache[canon] = cached;
             var fetchClass = resourceSpec.fetchClass;
             if (fetchClass) {
                 if (!pendingClass[fetchClass]) {
                     pendingClass[fetchClass] = {};
                 }
                 pendingClass[fetchClass][canon] = resourceSpec;
             }
             options.cache = false; // TODO: Getting weird "not modified" issues on Firefox
             $.ajax(options);
         }
         else {
             if (!cached.$$firer$$) {
                 options.success(cached);
             }
             else {
                 fluid.log("Request for cached resource which is in flight: url " + canon);
                 cached.addListener(function(response) {
                     options.success(response);
                 });
             }
         }
    };
    
    /*
     * This function is unsupported: It is not really intended for use by implementors.
     */
    // Compose callbacks in such a way that the 2nd, marked "external" will be applied
    // first if it exists, but in all cases, the first, marked internal, will be 
    // CALLED WITHOUT FAIL
    fluid.fetchResources.composeCallbacks = function (internal, external) {
        return external ? (internal ? 
        function () {
            try {
                external.apply(null, arguments);
            }
            catch (e) {
                fluid.log("Exception applying external fetchResources callback: " + e);
            }
            internal.apply(null, arguments); // call the internal callback without fail
        } : external ) : internal;
    };
    
    // unsupported, NON-API function
    fluid.fetchResources.composePolicy = function(target, source, key) {
        return fluid.fetchResources.composeCallbacks(target, source);
    };
    
    fluid.defaults("fluid.fetchResources.issueRequest", {
        mergePolicy: {
            success: fluid.fetchResources.composePolicy,
            error: fluid.fetchResources.composePolicy,
            url: "reverse"
        }
    });
    
    // unsupported, NON-API function
    fluid.fetchResources.issueRequest = function(resourceSpec, key) {
        var thisCallback = fluid.fetchResources.makeResourceCallback(resourceSpec);
        var options = {  
             url:     resourceSpec.href,
             success: thisCallback.success, 
             error:   thisCallback.error,
             dataType: "text"};
        fluid.fetchResources.timeSuccessCallback(resourceSpec);
        options = fluid.merge(fluid.defaults("fluid.fetchResources.issueRequest").mergePolicy,
                      options, resourceSpec.options);
        resourceSpec.queued = true;
        resourceSpec.initTime = new Date();
        fluid.log("Request with key " + key + " queued for " + resourceSpec.href);

        if (resourceSpec.forceCache) {
            fluid.fetchResources.issueCachedRequest(resourceSpec, options);
        }
        else {
            $.ajax(options);
        }
    };
    
    fluid.fetchResources.fetchResourcesImpl = function(that) {
        var complete = true;
        var allSync = true;
        var resourceSpecs = that.resourceSpecs;
        for (var key in resourceSpecs) {
            var resourceSpec = resourceSpecs[key];
            if (!resourceSpec.options || resourceSpec.options.async) {
                allSync = false;
            }
            if (resourceSpec.href && !resourceSpec.completeTime) {
                 if (!resourceSpec.queued) {
                     fluid.fetchResources.issueRequest(resourceSpec, key);  
                 }
                 if (resourceSpec.queued) {
                     complete = false;
                 }
            }
            else if (resourceSpec.nodeId && !resourceSpec.resourceText) {
                var node = document.getElementById(resourceSpec.nodeId);
                // upgrade this to somehow detect whether node is "armoured" somehow
                // with comment or CDATA wrapping
                resourceSpec.resourceText = fluid.dom.getElementText(node);
                resourceSpec.resourceKey = resourceSpec.nodeId;
            }
        }
        if (complete && that.callback && !that.callbackCalled) {
            that.callbackCalled = true;
            if ($.browser.mozilla && !allSync) {
                // Defer this callback to avoid debugging problems on Firefox
                setTimeout(function() {
                    that.callback(resourceSpecs);
                    }, 1);
            }
            else {
                that.callback(resourceSpecs);
            }
        }
    };
    
    // TODO: This framework function is a stop-gap before the "ginger world" is capable of
    // asynchronous instantiation. It currently performs very poor fidelity expansion of a
    // component's options to discover "resources" only held in the static environment
    fluid.fetchResources.primeCacheFromResources = function(componentName) {
        var resources = fluid.defaults(componentName).resources;
        var expanded = (fluid.expandOptions ? fluid.expandOptions : fluid.identity)(fluid.copy(resources));
        fluid.fetchResources(expanded);
    };
    
    /** Utilities invoking requests for expansion **/
    fluid.registerNamespace("fluid.expander");
      
    /*
     * This function is unsupported: It is not really intended for use by implementors.
     */
    fluid.expander.makeDefaultFetchOptions = function (successdisposer, failid, options) {
        return $.extend(true, {dataType: "text"}, options, {
            success: function(response, environmentdisposer) {
                var json = JSON.parse(response);
                environmentdisposer(successdisposer(json));
            },
            error: function(response, textStatus) {
                fluid.log("Error fetching " + failid + ": " + textStatus);
            }
        });
    };
  
    /*
     * This function is unsupported: It is not really intended for use by implementors.
     */
    fluid.expander.makeFetchExpander = function (options) {
        return { expander: {
            type: "fluid.expander.deferredFetcher",
            href: options.url,
            options: fluid.expander.makeDefaultFetchOptions(options.disposer, options.url, options.options),
            resourceSpecCollector: "{resourceSpecCollector}",
            fetchKey: options.fetchKey
        }};
    };
    
    fluid.expander.deferredFetcher = function(deliverer, source, expandOptions) {
        var expander = source.expander;
        var spec = fluid.copy(expander);
        // fetch the "global" collector specified in the external environment to receive
        // this resourceSpec
        var collector = fluid.expand(expander.resourceSpecCollector, expandOptions);
        delete spec.type;
        delete spec.resourceSpecCollector;
        delete spec.fetchKey;
        var environmentdisposer = function(disposed) {
            deliverer(disposed);
        };
        // replace the callback which is there (taking 2 arguments) with one which
        // directly responds to the request, passing in the result and OUR "disposer" - 
        // which once the user has processed the response (say, parsing JSON and repackaging)
        // finally deposits it in the place of the expander in the tree to which this reference
        // has been stored at the point this expander was evaluated.
        spec.options.success = function(response) {
             expander.options.success(response, environmentdisposer);
        };
        var key = expander.fetchKey || fluid.allocateGuid();
        collector[key] = spec;
        return fluid.NO_VALUE;
    };
    
    
})(jQuery, fluid_1_5);
// =========================================================================
//
// tinyxmlsax.js - an XML SAX parser in JavaScript compressed for downloading
//
// version 3.1
//
// =========================================================================
//
// Copyright (C) 2000 - 2002, 2003 Michael Houghton (mike@idle.org), Raymond Irving and David Joham (djoham@yahoo.com)
//
// This library is free software; you can redistribute it and/or
// modify it under the terms of the GNU Lesser General Public
// License as published by the Free Software Foundation; either
// version 2.1 of the License, or (at your option) any later version.

// This library is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
// Lesser General Public License for more details.

// You should have received a copy of the GNU Lesser General Public
// License along with this library; if not, write to the Free Software
// Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA  02111-1307  USA
//
// Visit the XML for <SCRIPT> home page at http://xmljs.sourceforge.net
//

/*
The zlib/libpng License

Copyright (c) 2000 - 2002, 2003 Michael Houghton (mike@idle.org), Raymond Irving and David Joham (djoham@yahoo.com)

This software is provided 'as-is', without any express or implied
warranty. In no event will the authors be held liable for any damages
arising from the use of this software.

Permission is granted to anyone to use this software for any purpose,
including commercial applications, and to alter it and redistribute it
freely, subject to the following restrictions:

    1. The origin of this software must not be misrepresented; you must not
    claim that you wrote the original software. If you use this software
    in a product, an acknowledgment in the product documentation would be
    appreciated but is not required.

    2. Altered source versions must be plainly marked as such, and must not be
    misrepresented as being the original software.

    3. This notice may not be removed or altered from any source
    distribution.
 */

// Declare dependencies
/*global fluid_1_5:true, jQuery*/

// JSLint options 
/*jslint white: true, funcinvoke: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

var fluid_1_5 = fluid_1_5 || {};

(function ($, fluid) {
    
    fluid.XMLP = function(strXML) {
        return fluid.XMLP.XMLPImpl(strXML);
    };

        
    // List of closed HTML tags, taken from JQuery 1.2.3
    fluid.XMLP.closedTags = {
        abbr: true, br: true, col: true, img: true, input: true,
        link: true, meta: true, param: true, hr: true, area: true, embed:true
        };

    fluid.XMLP._NONE = 0;
    fluid.XMLP._ELM_B = 1;
    fluid.XMLP._ELM_E = 2;
    fluid.XMLP._ELM_EMP = 3; 
    fluid.XMLP._ATT = 4;
    fluid.XMLP._TEXT = 5;
    fluid.XMLP._ENTITY = 6; 
    fluid.XMLP._PI = 7;
    fluid.XMLP._CDATA = 8;
    fluid.XMLP._COMMENT = 9; 
    fluid.XMLP._DTD = 10;
    fluid.XMLP._ERROR = 11;
     
    fluid.XMLP._CONT_XML = 0; 
    fluid.XMLP._CONT_ALT = 1; 
    fluid.XMLP._ATT_NAME = 0; 
    fluid.XMLP._ATT_VAL = 1;
    
    fluid.XMLP._STATE_PROLOG = 1;
    fluid.XMLP._STATE_DOCUMENT = 2; 
    fluid.XMLP._STATE_MISC = 3;
    
    fluid.XMLP._errs = [];
    fluid.XMLP._errs[fluid.XMLP.ERR_CLOSE_PI = 0 ] = "PI: missing closing sequence"; 
    fluid.XMLP._errs[fluid.XMLP.ERR_CLOSE_DTD = 1 ] = "DTD: missing closing sequence"; 
    fluid.XMLP._errs[fluid.XMLP.ERR_CLOSE_COMMENT = 2 ] = "Comment: missing closing sequence"; 
    fluid.XMLP._errs[fluid.XMLP.ERR_CLOSE_CDATA = 3 ] = "CDATA: missing closing sequence"; 
    fluid.XMLP._errs[fluid.XMLP.ERR_CLOSE_ELM = 4 ] = "Element: missing closing sequence"; 
    fluid.XMLP._errs[fluid.XMLP.ERR_CLOSE_ENTITY = 5 ] = "Entity: missing closing sequence"; 
    fluid.XMLP._errs[fluid.XMLP.ERR_PI_TARGET = 6 ] = "PI: target is required"; 
    fluid.XMLP._errs[fluid.XMLP.ERR_ELM_EMPTY = 7 ] = "Element: cannot be both empty and closing"; 
    fluid.XMLP._errs[fluid.XMLP.ERR_ELM_NAME = 8 ] = "Element: name must immediatly follow \"<\""; 
    fluid.XMLP._errs[fluid.XMLP.ERR_ELM_LT_NAME = 9 ] = "Element: \"<\" not allowed in element names"; 
    fluid.XMLP._errs[fluid.XMLP.ERR_ATT_VALUES = 10] = "Attribute: values are required and must be in quotes"; 
    fluid.XMLP._errs[fluid.XMLP.ERR_ATT_LT_NAME = 11] = "Element: \"<\" not allowed in attribute names"; 
    fluid.XMLP._errs[fluid.XMLP.ERR_ATT_LT_VALUE = 12] = "Attribute: \"<\" not allowed in attribute values"; 
    fluid.XMLP._errs[fluid.XMLP.ERR_ATT_DUP = 13] = "Attribute: duplicate attributes not allowed"; 
    fluid.XMLP._errs[fluid.XMLP.ERR_ENTITY_UNKNOWN = 14] = "Entity: unknown entity"; 
    fluid.XMLP._errs[fluid.XMLP.ERR_INFINITELOOP = 15] = "Infinite loop"; 
    fluid.XMLP._errs[fluid.XMLP.ERR_DOC_STRUCTURE = 16] = "Document: only comments, processing instructions, or whitespace allowed outside of document element"; 
    fluid.XMLP._errs[fluid.XMLP.ERR_ELM_NESTING = 17] = "Element: must be nested correctly"; 
                

    fluid.XMLP._checkStructure = function(that, iEvent) {
        var stack = that.m_stack; 
        if (fluid.XMLP._STATE_PROLOG == that.m_iState) {
            // disabled original check for text node in prologue
            that.m_iState = fluid.XMLP._STATE_DOCUMENT;
            }
    
        if (fluid.XMLP._STATE_DOCUMENT === that.m_iState) {
            if ((fluid.XMLP._ELM_B == iEvent) || (fluid.XMLP._ELM_EMP == iEvent)) { 
                that.m_stack[stack.length] = that.getName();
                }
            if ((fluid.XMLP._ELM_E == iEvent) || (fluid.XMLP._ELM_EMP == iEvent)) {
                if (stack.length === 0) {
                    //return this._setErr(XMLP.ERR_DOC_STRUCTURE);
                    return fluid.XMLP._NONE;
                    }
                var strTop = stack[stack.length - 1];
                that.m_stack.length--;
                if (strTop === null || strTop !== that.getName()) { 
                    return that._setErr(that, fluid.XMLP.ERR_ELM_NESTING);
                    }
                }
    
            // disabled original check for text node in epilogue - "MISC" state is disused
        }
        return iEvent;
    };
    
            
    fluid.XMLP._parseCDATA = function(that, iB) { 
        var iE = that.m_xml.indexOf("]]>", iB); 
        if (iE == -1) { return fluid.XMLP._setErr(that, fluid.XMLP.ERR_CLOSE_CDATA);}
        fluid.XMLP._setContent(that, fluid.XMLP._CONT_XML, iB, iE); 
        that.m_iP = iE + 3; 
        return fluid.XMLP._CDATA;
        };
        
    
    fluid.XMLP._parseComment = function(that, iB) { 
        var iE = that.m_xml.indexOf("-" + "->", iB); 
        if (iE == -1) { 
            return fluid.XMLP._setErr(that, fluid.XMLP.ERR_CLOSE_COMMENT);
            }
        fluid.XMLP._setContent(that, fluid.XMLP._CONT_XML, iB - 4, iE + 3); 
        that.m_iP = iE + 3; 
        return fluid.XMLP._COMMENT;
        };    
    
    fluid.XMLP._parseDTD = function(that, iB) { 
        var iE, strClose, iInt, iLast; 
        iE = that.m_xml.indexOf(">", iB); 
        if (iE == -1) { 
            return fluid.XMLP._setErr(that, fluid.XMLP.ERR_CLOSE_DTD);
            }
        iInt = that.m_xml.indexOf("[", iB); 
        strClose = ((iInt != -1) && (iInt < iE)) ? "]>" : ">"; 
        while (true) { 
            if (iE == iLast) { 
                return fluid.XMLP._setErr(that, fluid.XMLP.ERR_INFINITELOOP);
                }
            iLast = iE; 
            iE = that.m_xml.indexOf(strClose, iB); 
            if(iE == -1) { 
                return fluid.XMLP._setErr(that, fluid.XMLP.ERR_CLOSE_DTD);
                }
            if (that.m_xml.substring(iE - 1, iE + 2) != "]]>") { break;}
            }
        that.m_iP = iE + strClose.length; 
        return fluid.XMLP._DTD;
        };
        
    fluid.XMLP._parsePI = function(that, iB) { 
        var iE, iTB, iTE, iCB, iCE; 
        iE = that.m_xml.indexOf("?>", iB); 
        if (iE == -1) { return fluid.XMLP._setErr(that, fluid.XMLP.ERR_CLOSE_PI);}
        iTB = fluid.SAXStrings.indexOfNonWhitespace(that.m_xml, iB, iE); 
        if (iTB == -1) { return fluid.XMLP._setErr(that, fluid.XMLP.ERR_PI_TARGET);}
        iTE = fluid.SAXStrings.indexOfWhitespace(that.m_xml, iTB, iE); 
        if (iTE == -1) { iTE = iE;}
        iCB = fluid.SAXStrings.indexOfNonWhitespace(that.m_xml, iTE, iE); 
        if (iCB == -1) { iCB = iE;}
        iCE = fluid.SAXStrings.lastIndexOfNonWhitespace(that.m_xml, iCB, iE); 
        if (iCE == -1) { iCE = iE - 1;}
        that.m_name = that.m_xml.substring(iTB, iTE); 
        fluid.XMLP._setContent(that, fluid.XMLP._CONT_XML, iCB, iCE + 1); 
        that.m_iP = iE + 2; 
        return fluid.XMLP._PI;
        };
        
    fluid.XMLP._parseText = function(that, iB) { 
        var iE = that.m_xml.indexOf("<", iB);
        if (iE == -1) { iE = that.m_xml.length;}
        fluid.XMLP._setContent(that, fluid.XMLP._CONT_XML, iB, iE); 
        that.m_iP = iE; 
        return fluid.XMLP._TEXT;
        };
        
    fluid.XMLP._setContent = function(that, iSrc) { 
        var args = arguments; 
        if (fluid.XMLP._CONT_XML == iSrc) { 
            that.m_cAlt = null; 
            that.m_cB = args[2]; 
            that.m_cE = args[3];
            } 
        else { 
            that.m_cAlt = args[2]; 
            that.m_cB = 0; 
            that.m_cE = args[2].length;
            }
            
        that.m_cSrc = iSrc;
        };
        
    fluid.XMLP._setErr = function(that, iErr) { 
        var strErr = fluid.XMLP._errs[iErr]; 
        that.m_cAlt = strErr; 
        that.m_cB = 0; 
        that.m_cE = strErr.length; 
        that.m_cSrc = fluid.XMLP._CONT_ALT; 
        return fluid.XMLP._ERROR;
        };
            
    
    fluid.XMLP._parseElement = function(that, iB) {
        var iE, iDE, iRet; 
        var iType, strN, iLast; 
        iDE = iE = that.m_xml.indexOf(">", iB); 
        if (iE == -1) { 
            return that._setErr(that, fluid.XMLP.ERR_CLOSE_ELM);
            }
        if (that.m_xml.charAt(iB) == "/") { 
            iType = fluid.XMLP._ELM_E; 
            iB++;
            } 
        else { 
            iType = fluid.XMLP._ELM_B;
            }
        if (that.m_xml.charAt(iE - 1) == "/") { 
            if (iType == fluid.XMLP._ELM_E) { 
                return fluid.XMLP._setErr(that, fluid.XMLP.ERR_ELM_EMPTY);
                }
            iType = fluid.XMLP._ELM_EMP; iDE--;
            }
    
        that.nameRegex.lastIndex = iB;
        var nameMatch = that.nameRegex.exec(that.m_xml);
        if (!nameMatch) {
            return fluid.XMLP._setErr(that, fluid.XMLP.ERR_ELM_NAME);
            }
        strN = nameMatch[1].toLowerCase();
        // This branch is specially necessary for broken markup in IE. If we see an li
        // tag apparently directly nested in another, first emit a synthetic close tag
        // for the earlier one without advancing the pointer, and set a flag to ensure
        // doing this just once.
        if ("li" === strN && iType !== fluid.XMLP._ELM_E && that.m_stack.length > 0 && 
            that.m_stack[that.m_stack.length - 1] === "li" && !that.m_emitSynthetic) {
            that.m_name = "li";
            that.m_emitSynthetic = true;
            return fluid.XMLP._ELM_E;
        }
        // We have acquired the tag name, now set about parsing any attribute list
        that.m_attributes = {};
        that.m_cAlt = ""; 
    
        if (that.nameRegex.lastIndex < iDE) {
            that.m_iP = that.nameRegex.lastIndex;
            while (that.m_iP < iDE) {
                that.attrStartRegex.lastIndex = that.m_iP;
                var attrMatch = that.attrStartRegex.exec(that.m_xml);
                if (!attrMatch) {
                    return fluid.XMLP._setErr(that, fluid.XMLP.ERR_ATT_VALUES);
                    }
                var attrname = attrMatch[1].toLowerCase();
                var attrval;
                if (that.m_xml.charCodeAt(that.attrStartRegex.lastIndex) === 61) { // = 
                    var valRegex = that.m_xml.charCodeAt(that.attrStartRegex.lastIndex + 1) === 34? that.attrValRegex : that.attrValIERegex; // "
                    valRegex.lastIndex = that.attrStartRegex.lastIndex + 1;
                    attrMatch = valRegex.exec(that.m_xml);
                    if (!attrMatch) {
                        return fluid.XMLP._setErr(that, fluid.XMLP.ERR_ATT_VALUES);
                        }
                    attrval = attrMatch[1];
                    }
                else { // accommodate insanity on unvalued IE attributes
                    attrval = attrname;
                    valRegex = that.attrStartRegex;
                    }
                if (!that.m_attributes[attrname]) {
                    that.m_attributes[attrname] = attrval;
                    }
                else { 
                    return fluid.XMLP._setErr(that, fluid.XMLP.ERR_ATT_DUP);
                }
                that.m_iP = valRegex.lastIndex;
                    
                }
            }
        if (strN.indexOf("<") != -1) { 
            return fluid.XMLP._setErr(that, fluid.XMLP.ERR_ELM_LT_NAME);
            }
    
        that.m_name = strN; 
        that.m_iP = iE + 1;
        // Check for corrupted "closed tags" from innerHTML
        if (fluid.XMLP.closedTags[strN]) {
            that.closeRegex.lastIndex = iE + 1;
            var closeMatch = that.closeRegex.exec;
            if (closeMatch) {
                var matchclose = that.m_xml.indexOf(strN, closeMatch.lastIndex);
                if (matchclose === closeMatch.lastIndex) {
                    return iType; // bail out, a valid close tag is separated only by whitespace
                }
                else {
                    return fluid.XMLP._ELM_EMP;
                }
            }
        }
        that.m_emitSynthetic = false;
        return iType;
    };
    
    fluid.XMLP._parse = function(that) {
        var iP = that.m_iP;
        var xml = that.m_xml; 
        if (iP === xml.length) { return fluid.XMLP._NONE;}
        var c = xml.charAt(iP);
        if (c === '<') {
            var c2 = xml.charAt(iP + 1);
            if (c2 === '?') {
                return fluid.XMLP._parsePI(that, iP + 2);
                }
            else if (c2 === '!') {
                if (iP === xml.indexOf("<!DOCTYPE", iP)) { 
                    return fluid.XMLP._parseDTD(that, iP + 9);
                    }
                else if (iP === xml.indexOf("<!--", iP)) { 
                    return fluid.XMLP._parseComment(that, iP + 4);
                    }
                else if (iP === xml.indexOf("<![CDATA[", iP)) { 
                    return fluid.XMLP._parseCDATA(that, iP + 9);
                    }
                }
            else {
                return fluid.XMLP._parseElement(that, iP + 1);
                }
            }
        else {
            return fluid.XMLP._parseText(that, iP);
            }
        };
        
    
    fluid.XMLP.XMLPImpl = function(strXML) { 
        var that = {};    
        that.m_xml = strXML; 
        that.m_iP = 0;
        that.m_iState = fluid.XMLP._STATE_PROLOG; 
        that.m_stack = [];
        that.m_attributes = {};
        that.m_emitSynthetic = false; // state used for emitting synthetic tags used to correct broken markup (IE)
        
        that.getColumnNumber = function() { 
            return fluid.SAXStrings.getColumnNumber(that.m_xml, that.m_iP);
        };
        
        that.getContent = function() { 
            return (that.m_cSrc == fluid.XMLP._CONT_XML) ? that.m_xml : that.m_cAlt;
        };
        
        that.getContentBegin = function() { return that.m_cB;};
        that.getContentEnd = function() { return that.m_cE;};
    
        that.getLineNumber = function() { 
            return fluid.SAXStrings.getLineNumber(that.m_xml, that.m_iP);
        };
        
        that.getName = function() { 
            return that.m_name;
        };
        
        that.next = function() { 
            return fluid.XMLP._checkStructure(that, fluid.XMLP._parse(that));
        };
    
        that.nameRegex = /([^\s\/>]+)/g;
        that.attrStartRegex = /\s*([\w:_][\w:_\-\.]*)/gm;
        that.attrValRegex = /\"([^\"]*)\"\s*/gm; // "normal" XHTML attribute values
        that.attrValIERegex = /([^\>\s]+)\s*/gm; // "stupid" unquoted IE attribute values (sometimes)
        that.closeRegex = /\s*<\//g;

        return that;
    };
    
    
    fluid.SAXStrings = {};
    
    fluid.SAXStrings.WHITESPACE = " \t\n\r"; 
    fluid.SAXStrings.QUOTES = "\"'"; 
    fluid.SAXStrings.getColumnNumber = function (strD, iP) { 
        if (!strD) { return -1;}
        iP = iP || strD.length; 
        var arrD = strD.substring(0, iP).split("\n"); 
        arrD.length--; 
        var iLinePos = arrD.join("\n").length; 
        return iP - iLinePos;
        };
        
    fluid.SAXStrings.getLineNumber = function (strD, iP) { 
        if (!strD) { return -1;}
        iP = iP || strD.length; 
        return strD.substring(0, iP).split("\n").length;
        };
        
    fluid.SAXStrings.indexOfNonWhitespace = function (strD, iB, iE) {
        if (!strD) return -1;
        iB = iB || 0; 
        iE = iE || strD.length; 
        
        for (var i = iB; i < iE; ++ i) { 
            var c = strD.charAt(i);
            if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r') return i;
            }
        return -1;
        };
        
        
    fluid.SAXStrings.indexOfWhitespace = function (strD, iB, iE) { 
        if (!strD) { return -1;}
            iB = iB || 0; 
            iE = iE || strD.length; 
            for (var i = iB; i < iE; i++) { 
                if (fluid.SAXStrings.WHITESPACE.indexOf(strD.charAt(i)) != -1) { return i;}
            }
        return -1;
        };
        
        
    fluid.SAXStrings.lastIndexOfNonWhitespace = function (strD, iB, iE) { 
            if (!strD) { return -1;}
            iB = iB || 0; iE = iE || strD.length; 
            for (var i = iE - 1; i >= iB; i--) { 
            if (fluid.SAXStrings.WHITESPACE.indexOf(strD.charAt(i)) == -1) { 
                return i;
                }
            }
        return -1;
        };
        
    fluid.SAXStrings.replace = function(strD, iB, iE, strF, strR) { 
        if (!strD) { return "";}
        iB = iB || 0; 
        iE = iE || strD.length; 
        return strD.substring(iB, iE).split(strF).join(strR);
        };
            
})(jQuery, fluid_1_5);
        /*
Copyright 2008-2010 University of Cambridge
Copyright 2008-2009 University of Toronto
Copyright 2010-2011 Lucendo Development Ltd.

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global fluid_1_5:true, jQuery*/

// JSLint options 
/*jslint white: true, funcinvoke: true, continue: true, elsecatch: true, operator: true, jslintok:true, undef: true, newcap: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

fluid_1_5 = fluid_1_5 || {};

(function ($, fluid) {

    // unsupported, non-API function      
    fluid.parseTemplate = function (template, baseURL, scanStart, cutpoints_in, opts) {
        opts = opts || {};
      
        if (!template) {
            fluid.fail("empty template supplied to fluid.parseTemplate");
        }
      
        var t;
        var parser;
        var tagstack;
        var lumpindex = 0;
        var nestingdepth = 0;
        var justended = false;
        
        var defstart = -1;
        var defend = -1;   
        
        var debugMode = false;
        
        var cutpoints = []; // list of selector, tree, id
        var simpleClassCutpoints = {};
        
        var cutstatus = [];
        
        var XMLLump = function (lumpindex, nestingdepth) {
            return {
                //rsfID: "",
                //text: "",
                //downmap: {},
                //attributemap: {},
                //finallump: {},
                nestingdepth: nestingdepth,
                lumpindex: lumpindex,
                parent: t
            };
        };
        
        function isSimpleClassCutpoint(tree) {
            return tree.length === 1 && tree[0].predList.length === 1 && tree[0].predList[0].clazz;
        }
        
        function init(baseURLin, debugModeIn, cutpointsIn) {
            t.rootlump = XMLLump(0, -1); // jslint:ok - capital letter
            tagstack = [t.rootlump];
            lumpindex = 0;
            nestingdepth = 0;
            justended = false;
            defstart = -1;
            defend = -1;
            baseURL = baseURLin;
            debugMode = debugModeIn;
            if (cutpointsIn) {
                for (var i = 0; i < cutpointsIn.length; ++i) {
                    var tree = fluid.parseSelector(cutpointsIn[i].selector, fluid.simpleCSSMatcher);
                    var clazz = isSimpleClassCutpoint(tree);
                    if (clazz) {
                        simpleClassCutpoints[clazz] = cutpointsIn[i].id;
                    }
                    else {
                        cutstatus.push([]);
                        cutpoints.push($.extend({}, cutpointsIn[i], {tree: tree}));
                    }
                }
            }
        }
        
        function findTopContainer() {
            for (var i = tagstack.length - 1; i >= 0; --i) {
                var lump = tagstack[i];
                if (lump.rsfID !== undefined) {
                    return lump;
                }
            }
            return t.rootlump;
        }
        
        function newLump() {
            var togo = XMLLump(lumpindex, nestingdepth); // jslint:ok - capital letter
            if (debugMode) {
                togo.line = parser.getLineNumber();
                togo.column = parser.getColumnNumber();
            }
            //togo.parent = t;
            t.lumps[lumpindex] = togo;
            ++lumpindex;
            return togo;
        }
        
        function addLump(mmap, ID, lump) {
            var list = mmap[ID];
            if (!list) {
                list = [];
                mmap[ID] = list;
            }
            list[list.length] = lump;
        }
          
        function checkContribute(ID, lump) {
            if (ID.indexOf("scr=contribute-") !== -1) {
                var scr = ID.substring("scr=contribute-".length);
                addLump(t.collectmap, scr, lump);
            }
        }
        
        function debugLump(lump) {
          // TODO expand this to agree with the Firebug "self-selector" idiom
            return "<" + lump.tagname + ">";
        }
        
        function hasCssClass(clazz, totest) {
            if (!totest) {
                return false;
            }
            // algorithm from jQuery
            return (" " + totest + " ").indexOf(" " + clazz + " ") !== -1;
        }
        
        function matchNode(term, headlump, headclazz) {
            if (term.predList) {
                for (var i = 0; i < term.predList.length; ++i) {
                    var pred = term.predList[i];
                    if (pred.id && headlump.attributemap.id !== pred.id) {return false;}
                    if (pred.clazz && !hasCssClass(pred.clazz, headclazz)) {return false;}
                    if (pred.tag && headlump.tagname !== pred.tag) {return false;}
                }
                return true;
            }
        }
        
        function tagStartCut(headlump) {
            var togo;
            var headclazz = headlump.attributemap["class"];
            if (headclazz) {
                var split = headclazz.split(" ");
                for (var i = 0; i < split.length; ++i) {
                    var simpleCut = simpleClassCutpoints[$.trim(split[i])];
                    if (simpleCut) {
                        return simpleCut;
                    }
                }
            }
            for (var i = 0; i < cutpoints.length; ++i) { // jslint:ok - scoping
                var cut = cutpoints[i];
                var cutstat = cutstatus[i];
                var nextterm = cutstat.length; // the next term for this node
                if (nextterm < cut.tree.length) {
                    var term = cut.tree[nextterm];
                    if (nextterm > 0) {
                        if (cut.tree[nextterm - 1].child && 
                                cutstat[nextterm - 1] !== headlump.nestingdepth - 1) {
                            continue; // it is a failure to match if not at correct nesting depth 
                        }
                    }
                    var isMatch = matchNode(term, headlump, headclazz);
                    if (isMatch) {
                        cutstat[cutstat.length] = headlump.nestingdepth;
                        if (cutstat.length === cut.tree.length) {
                            if (togo !== undefined) {
                                fluid.fail("Cutpoint specification error - node " +
                                    debugLump(headlump) +
                                    " has already matched with rsf:id of " + togo);
                            }
                            if (cut.id === undefined || cut.id === null) {
                                fluid.fail("Error in cutpoints list - entry at position " + i + " does not have an id set");
                            }
                            togo = cut.id;
                        }
                    }
                }
            }
            return togo;
        }
          
        function tagEndCut() {
            if (cutpoints) {
                for (var i = 0; i < cutpoints.length; ++i) {
                    var cutstat = cutstatus[i];
                    if (cutstat.length > 0 && cutstat[cutstat.length - 1] === nestingdepth) {
                        cutstat.length--;
                    }
                }
            }
        }
        
        function processTagEnd() {
            tagEndCut();
            var endlump = newLump();
            --nestingdepth;
            endlump.text = "</" + parser.getName() + ">";
            var oldtop = tagstack[tagstack.length - 1];
            oldtop.close_tag = t.lumps[lumpindex - 1];
            tagstack.length--;
            justended = true;
        }
        
        function processTagStart(isempty, text) {
            ++nestingdepth;
            if (justended) {
                justended = false;
                var backlump = newLump();
                backlump.nestingdepth--;
            }
            if (t.firstdocumentindex === -1) {
                t.firstdocumentindex = lumpindex;
            }
            var headlump = newLump();
            var stacktop = tagstack[tagstack.length - 1];
            headlump.uplump = stacktop;
            var tagname = parser.getName();
            headlump.tagname = tagname;
            // NB - attribute names and values are now NOT DECODED!!
            var attrs = headlump.attributemap = parser.m_attributes;
            var ID = attrs[fluid.ID_ATTRIBUTE];
            if (ID === undefined) {
                ID = tagStartCut(headlump);
            }
            for (var attrname in attrs) {
                if (ID === undefined) {
                    if (/href|src|codebase|action/.test(attrname)) {
                        ID = "scr=rewrite-url";
                    }
                    // port of TPI effect of IDRelationRewriter
                    else if (ID === undefined && /for|headers/.test(attrname)) {
                        ID = "scr=null";
                    }
                }
            }
        
            if (ID) {
                // TODO: ensure this logic is correct on RSF Server
                if (ID.charCodeAt(0) === 126) { // "~"
                    ID = ID.substring(1);
                    headlump.elide = true;
                }
                checkContribute(ID, headlump);
                headlump.rsfID = ID;
                var downreg = findTopContainer();
                if (!downreg.downmap) {
                    downreg.downmap = {};
                }
                while (downreg) { // TODO: unusual fix for locating branches in parent contexts (applies to repetitive leaves)
                    if (downreg.downmap) {
                        addLump(downreg.downmap, ID, headlump);
                    }
                    downreg = downreg.uplump;
                }
                addLump(t.globalmap, ID, headlump);
                var colpos = ID.indexOf(":");
                if (colpos !== -1) {
                    var prefix = ID.substring(0, colpos);
                    if (!stacktop.finallump) {
                        stacktop.finallump = {};
                    }
                    stacktop.finallump[prefix] = headlump;
                }
            }
            
            // TODO: accelerate this by grabbing original template text (requires parser
            // adjustment) as well as dealing with empty tags
            headlump.text = "<" + tagname + fluid.dumpAttributes(attrs) + (isempty && !ID? "/>" : ">");
            tagstack[tagstack.length] = headlump;
            if (isempty) {
                if (ID) {
                    processTagEnd();
                }
                else {
                    --nestingdepth;
                    tagstack.length--;
                }
            }
        }
        

        
        function processDefaultTag() {
            if (defstart !== -1) {
                if (t.firstdocumentindex === -1) {
                    t.firstdocumentindex = lumpindex;
                }
                var text = parser.getContent().substr(defstart, defend - defstart);
                justended = false;
                var newlump = newLump();
                newlump.text = text; 
                defstart = -1;
            }
        }
       
       /** ACTUAL BODY of fluid.parseTemplate begins here **/
          
        t = fluid.XMLViewTemplate();
        
        init(baseURL, opts.debugMode, cutpoints_in);
    
        var idpos = template.indexOf(fluid.ID_ATTRIBUTE);
        if (scanStart) {
            var brackpos = template.indexOf('>', idpos);
            parser = fluid.XMLP(template.substring(brackpos + 1));
        }
        else {
            parser = fluid.XMLP(template); 
        }
    
parseloop: while (true) {
            var iEvent = parser.next();
            switch (iEvent) {
            case fluid.XMLP._ELM_B:
                processDefaultTag();
                //var text = parser.getContent().substr(parser.getContentBegin(), parser.getContentEnd() - parser.getContentBegin());
                processTagStart(false, "");
                break;
            case fluid.XMLP._ELM_E:
                processDefaultTag();
                processTagEnd();
                break;
            case fluid.XMLP._ELM_EMP:
                processDefaultTag();
                //var text = parser.getContent().substr(parser.getContentBegin(), parser.getContentEnd() - parser.getContentBegin());    
                processTagStart(true, "");
                break;
            case fluid.XMLP._PI:
            case fluid.XMLP._DTD:
                defstart = -1;
                continue; // not interested in reproducing these
            case fluid.XMLP._TEXT:
            case fluid.XMLP._ENTITY:
            case fluid.XMLP._CDATA:
            case fluid.XMLP._COMMENT:
                if (defstart === -1) {
                    defstart = parser.m_cB;
                }
                defend = parser.m_cE;
                break;
            case fluid.XMLP._ERROR:
                fluid.setLogging(true);
                var message = "Error parsing template: " + parser.m_cAlt + " at line " + parser.getLineNumber(); 
                fluid.log(message);
                fluid.log("Just read: " + parser.m_xml.substring(parser.m_iP - 30, parser.m_iP));
                fluid.log("Still to read: " + parser.m_xml.substring(parser.m_iP, parser.m_iP + 30));
                fluid.fail(message);
                break parseloop;
            case fluid.XMLP._NONE:
                break parseloop;
            }
        }
        processDefaultTag();
        var excess = tagstack.length - 1; 
        if (excess) {
            fluid.fail("Error parsing template - unclosed tag(s) of depth " + (excess) + 
                ": " + fluid.transform(tagstack.splice(1, excess), function (lump) {return debugLump(lump);}).join(", "));
        }
        return t;
    };

    // unsupported, non-API function    
    fluid.debugLump = function (lump) {
        var togo = lump.text;
        togo += " at ";
        togo += "lump line " + lump.line + " column " + lump.column + " index " + lump.lumpindex;
        togo += lump.parent.href === null? "" : " in file " + lump.parent.href;
        return togo;
    };
    
    // Public definitions begin here
    
    fluid.ID_ATTRIBUTE = "rsf:id";

    // unsupported, non-API function    
    fluid.getPrefix = function (id) {
        var colpos = id.indexOf(':');
        return colpos === -1? id : id.substring(0, colpos);
    };
    
    // unsupported, non-API function
    fluid.SplitID = function (id) {
        var that = {};
        var colpos = id.indexOf(':');
        if (colpos === -1) {
            that.prefix = id;
        }
        else {
            that.prefix = id.substring(0, colpos);
            that.suffix = id.substring(colpos + 1);
        }
        return that;
    };

    // unsupported, non-API function    
    fluid.XMLViewTemplate = function () {
        return {
            globalmap: {},
            collectmap: {},
            lumps: [],
            firstdocumentindex: -1
        };
    };
    
    // TODO: find faster encoder
    fluid.XMLEncode = function (text) {
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;"); 
    };
    
    // unsupported, non-API function    
    fluid.dumpAttributes = function (attrcopy) {
        var togo = "";
        for (var attrname in attrcopy) {
            var attrvalue = attrcopy[attrname];
            if (attrvalue !== null && attrvalue !== undefined) {
                togo += " " + attrname + "=\"" + attrvalue + "\"";
            }
        }
        return togo;
    };

    // unsupported, non-API function    
    fluid.aggregateMMap = function (target, source) {
        for (var key in source) {
            var targhas = target[key];
            if (!targhas) {
                target[key] = [];
            }
            target[key] = target[key].concat(source[key]);
        }
    };
    
    /** Returns a "template structure", with globalmap in the root, and a list
     * of entries {href, template, cutpoints} for each parsed template.
     */
    fluid.parseTemplates = function (resourceSpec, templateList, opts) {
        var togo = [];
        opts = opts || {};
        togo.globalmap = {};
        for (var i = 0; i < templateList.length; ++i) {
            var resource = resourceSpec[templateList[i]];
            var lastslash = resource.href.lastIndexOf("/");
            var baseURL = lastslash === -1? "" : resource.href.substring(0, lastslash + 1);
              
            var template = fluid.parseTemplate(resource.resourceText, baseURL, 
                opts.scanStart && i === 0, resource.cutpoints, opts);
            if (i === 0) {
                fluid.aggregateMMap(togo.globalmap, template.globalmap);
            }
            template.href = resource.href;
            template.baseURL = baseURL;
            template.resourceKey = resource.resourceKey;
      
            togo[i] = template;
            fluid.aggregateMMap(togo.globalmap, template.rootlump.downmap);
        }
        return togo;
    };
      
})(jQuery, fluid_1_5);
/*
Copyright 2008-2010 University of Cambridge
Copyright 2008-2009 University of Toronto
Copyright 2010-2011 Lucendo Development Ltd.

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global fluid_1_5:true, jQuery*/

// JSLint options 
/*jslint white: true, funcinvoke: true, continue: true, elsecatch: true, operator: true, jslintok:true, undef: true, newcap: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

fluid_1_5 = fluid_1_5 || {};

(function ($, fluid) {
  
    function debugPosition(component) {
        return "as child of " + (component.parent.fullID ? "component with full ID " + component.parent.fullID : "root");
    }
     
    function computeFullID(component) {
        var togo = "";
        var move = component;
        if (component.children === undefined) { // not a container
            // unusual case on the client-side, since a repetitive leaf may have localID blasted onto it.
            togo = component.ID + (component.localID !== undefined ? component.localID : "");
            move = component.parent;
        }
        
        while (move.parent) {
            var parent = move.parent;
            if (move.fullID !== undefined) {
                togo = move.fullID + togo;
                return togo;
            }
            if (move.noID === undefined) {
                var ID = move.ID;
                if (ID === undefined) {
                    fluid.fail("Error in component tree - component found with no ID " +
                        debugPosition(parent) + ": please check structure");
                }
                var colpos = ID.indexOf(":");
                var prefix = colpos === -1 ? ID : ID.substring(0, colpos);
                togo = prefix + ":" + (move.localID === undefined ? "" : move.localID) + ":" + togo;
            }
            move = parent;
        }
        
        return togo;
    }

    var renderer = {};
  
    renderer.isBoundPrimitive = function (value) {
        return fluid.isPrimitive(value) || fluid.isArrayable(value) 
            && (value.length === 0 || typeof (value[0]) === "string"); // jslint:ok
    };
  
    var unzipComponent;
  
    function processChild(value, key) {
        if (renderer.isBoundPrimitive(value)) {
            return {componentType: "UIBound", value: value, ID: key};
        } 
        else {
            var unzip = unzipComponent(value);
            if (unzip.ID) {
                return {ID: key, componentType: "UIContainer", children: [unzip]};
            } else {
                unzip.ID = key;
                return unzip;
            } 
        }
    }
  
    function fixChildren(children) {
        if (!fluid.isArrayable(children)) {
            var togo = [];
            for (var key in children) {
                var value = children[key];
                if (fluid.isArrayable(value)) {
                    for (var i = 0; i < value.length; ++i) {
                        var processed = processChild(value[i], key);
          //            if (processed.componentType === "UIContainer" &&
          //              processed.localID === undefined) {
          //              processed.localID = i;
          //            }
                        togo[togo.length] = processed;
                    }
                } else {
                    togo[togo.length] = processChild(value, key);
                } 
            }
            return togo;
        } else {return children; }
    }
  
    function fixupValue(uibound, model, resolverGetConfig) {
        if (uibound.value === undefined && uibound.valuebinding !== undefined) {
            if (!model) {
                fluid.fail("Cannot perform value fixup for valuebinding " 
                    + uibound.valuebinding + " since no model was supplied to rendering");
            }
            uibound.value = fluid.get(model, uibound.valuebinding, resolverGetConfig);
        }
    }
  
    function upgradeBound(holder, property, model, resolverGetConfig) {
        if (holder[property] !== undefined) {
            if (renderer.isBoundPrimitive(holder[property])) {
                holder[property] = {value: holder[property]};
            }
            else if (holder[property].messagekey) {
                holder[property].componentType = "UIMessage";
            }
        }
        else {
            holder[property] = {value: null};
        }
        fixupValue(holder[property], model, resolverGetConfig);
    }
  
    renderer.duckMap = {children: "UIContainer", 
            value: "UIBound", valuebinding: "UIBound", messagekey: "UIMessage", 
            markup: "UIVerbatim", selection: "UISelect", target: "UILink",
            choiceindex: "UISelectChoice", functionname: "UIInitBlock"};
      
    var boundMap = {
        UISelect:   ["selection", "optionlist", "optionnames"],
        UILink:     ["target", "linktext"],
        UIVerbatim: ["markup"],
        UIMessage:  ["messagekey"]
    };
  
    renderer.boundMap = fluid.transform(boundMap, fluid.arrayToHash);
      
    renderer.inferComponentType = function (component) {
        for (var key in renderer.duckMap) {
            if (component[key] !== undefined) {
                return renderer.duckMap[key];
            }
        }
    };
  
    renderer.applyComponentType = function (component) {
        component.componentType = renderer.inferComponentType(component);
        if (component.componentType === undefined && component.ID !== undefined) {
            component.componentType = "UIBound";
        }
    };
    
    unzipComponent = function (component, model, resolverGetConfig) {
        if (component) {
            renderer.applyComponentType(component);
        }
        if (!component || component.componentType === undefined) {
            var decorators = component.decorators;
            if (decorators) {delete component.decorators;}
            component = {componentType: "UIContainer", children: component};
            component.decorators = decorators;
        }
        var cType = component.componentType;
        if (cType === "UIContainer") {
            component.children = fixChildren(component.children);
        }
        else {
            var map = renderer.boundMap[cType];
            if (map) {
                fluid.each(map, function (value, key) {
                    upgradeBound(component, key, model, resolverGetConfig);
                });
            }
        }
        
        return component;
    };
    
    function fixupTree(tree, model, resolverGetConfig) {
        if (tree.componentType === undefined) {
            tree = unzipComponent(tree, model, resolverGetConfig);
        }
        if (tree.componentType !== "UIContainer" && !tree.parent) {
            tree = {children: [tree]};
        }
        
        if (tree.children) {
            tree.childmap = {};
            for (var i = 0; i < tree.children.length; ++i) {
                var child = tree.children[i];
                if (child.componentType === undefined) {
                    child = unzipComponent(child, model, resolverGetConfig);
                    tree.children[i] = child;
                }
                child.parent = tree;
                if (child.ID === undefined) {
                    fluid.fail("Error in component tree: component found with no ID " + debugPosition(child));
                }
                tree.childmap[child.ID] = child;
                var colpos = child.ID.indexOf(":"); 
                if (colpos === -1) {
                //  tree.childmap[child.ID] = child; // moved out of branch to allow
                // "relative id expressions" to be easily parsed
                }
                else { // jslint:ok - TODO: review the above
                    var prefix = child.ID.substring(0, colpos);
                    var childlist = tree.childmap[prefix]; 
                    if (!childlist) {
                        childlist = [];
                        tree.childmap[prefix] = childlist;
                    }
                    if (child.localID === undefined && childlist.length !== 0) {
                        child.localID = childlist.length;
                    }
                    childlist[childlist.length] = child;
                }
                child.fullID = computeFullID(child);
        
                var componentType = child.componentType;
                if (componentType === "UISelect") {
                    child.selection.fullID = child.fullID;
                }
                else if (componentType === "UIInitBlock") {
                    var call = child.functionname + '(';
                    for (var j = 0; j < child.arguments.length; ++j) { // jslint:ok
                        if (child.arguments[j] instanceof fluid.ComponentReference) { // jslint:ok
                            // TODO: support more forms of id reference
                            child.arguments[j] = child.parent.fullID + child.arguments[j].reference; // jslint:ok
                        }
                        call += JSON.stringify(child.arguments[j]); // jslint:ok
                        if (j < child.arguments.length - 1) { // jslint:ok
                            call += ", ";
                        }
                    }
                    child.markup = {value: call + ")\n"};
                    child.componentType = "UIVerbatim";
                }
                else if (componentType === "UIBound") {
                    fixupValue(child, model, resolverGetConfig);
                }
                fixupTree(child, model, resolverGetConfig);
            }
        }
        return tree;
    }
    
    fluid.NULL_STRING = "\u25a9null\u25a9";
  
    var LINK_ATTRIBUTES = {
        a: "href", link: "href", img: "src", frame: "src", script: "src", style: "src", input: "src", embed: "src", // jslint:ok
        form: "action",
        applet: "codebase", object: "codebase" //jslint:ok
    };
    
    renderer.decoratorComponentPrefix = "**-renderer-";
  
    renderer.IDtoComponentName = function(ID, num) {
        return renderer.decoratorComponentPrefix + ID.replace(/\./g, "") + "-" + num;
    };
    
    renderer.invokeFluidDecorator = function(func, args, ID, num, options) {
        var that;
        if (options.parentComponent) {
            var parent = options.parentComponent;
            var name = renderer.IDtoComponentName(ID, num);
            // TODO: The best we can do here without GRADES is to wildly guess 
            // that it is a view component with options in the 2nd place and container in first place
            fluid.set(parent, fluid.path("options", "components", name), {type: func});
            // This MIGHT really be a variant of fluid.invoke... only we often probably DO want the component
            // itself to be inserted into the that stack. This *ALSO* requires GRADES to resolve. A 
            // "function" is that which has no grade. The gradeless grade.
            that = fluid.initDependent(options.parentComponent, name, args);
        }
        else {
            that = fluid.invokeGlobalFunction(func, args);
        }
        return that;
    };
  
    fluid.renderer = function (templates, tree, options, fossilsIn) {
      
        options = options || {};
        tree = tree || {};
        var debugMode = options.debugMode;
        if (!options.messageLocator && options.messageSource) {
            options.messageLocator = fluid.resolveMessageSource(options.messageSource);
        }
        options.document = options.document || document;
        options.jQuery = options.jQuery || $;
        options.fossils = options.fossils || fossilsIn || {}; // map of submittingname to {EL, submittingname, oldvalue}
      
        var globalmap = {};
        var branchmap = {};
        var rewritemap = {}; // map of rewritekey (for original id in template) to full ID 
        var seenset = {};
        var collected = {};
        var out = "";
        var renderOptions = options;
        var decoratorQueue = [];
        
        var renderedbindings = {}; // map of fullID to true for UISelects which have already had bindings written
        var usedIDs = {};
        
        var that = {options: options};
        
        function getRewriteKey(template, parent, id) {
            return template.resourceKey + parent.fullID + id;
        }
        // returns: lump
        function resolveInScope(searchID, defprefix, scope, child) {
            var deflump;
            var scopelook = scope? scope[searchID] : null;
            if (scopelook) {
                for (var i = 0; i < scopelook.length; ++i) {
                    var scopelump = scopelook[i];
                    if (!deflump && scopelump.rsfID === defprefix) {
                        deflump = scopelump;
                    }
                    if (scopelump.rsfID === searchID) {
                        return scopelump;
                    }
                }
            }
            return deflump;
        }
        // returns: lump
        function resolveCall(sourcescope, child) {
            var searchID = child.jointID? child.jointID : child.ID;
            var split = fluid.SplitID(searchID);
            var defprefix = split.prefix + ':';
            var match = resolveInScope(searchID, defprefix, sourcescope.downmap, child);
            if (match) {return match;}
            if (child.children) {
                match = resolveInScope(searchID, defprefix, globalmap, child);
                if (match) {return match;}
            }
            return null;
        }
        
        function noteCollected(template) {
            if (!seenset[template.href]) {
                fluid.aggregateMMap(collected, template.collectmap);
                seenset[template.href] = true;
            }
        }
        
        var fetchComponent;
        
        function resolveRecurse(basecontainer, parentlump) {
            for (var i = 0; i < basecontainer.children.length; ++i) {
                var branch = basecontainer.children[i];
                if (branch.children) { // it is a branch
                    var resolved = resolveCall(parentlump, branch);
                    if (resolved) {
                        branchmap[branch.fullID] = resolved;
                        var id = resolved.attributemap.id;
                        if (id !== undefined) {
                            rewritemap[getRewriteKey(parentlump.parent, basecontainer, id)] = branch.fullID;
                        }
                        // on server-side this is done separately
                        noteCollected(resolved.parent);
                        resolveRecurse(branch, resolved);
                    }
                }
            }
            // collect any rewritten ids for the purpose of later rewriting
            if (parentlump.downmap) {
                for (var id in parentlump.downmap) { // jslint:ok - scoping
                  //if (id.indexOf(":") === -1) {
                    var lumps = parentlump.downmap[id];
                    for (var i = 0; i < lumps.length; ++i) { // jslint:ok - scoping
                        var lump = lumps[i];
                        var lumpid = lump.attributemap.id;
                        if (lumpid !== undefined && lump.rsfID !== undefined) {
                            var resolved = fetchComponent(basecontainer, lump.rsfID); //jslint:ok - scoping
                            if (resolved !== null) {
                                var resolveID = resolved.fullID;
                                rewritemap[getRewriteKey(parentlump.parent, basecontainer,
                                    lumpid)] = resolveID;
                            }
                        }
                    }
                //  }
                } 
            }
            
        }
        
        function resolveBranches(globalmapp, basecontainer, parentlump) {
            branchmap = {};
            rewritemap = {};
            seenset = {};
            collected = {};
            globalmap = globalmapp;
            branchmap[basecontainer.fullID] = parentlump;
            resolveRecurse(basecontainer, parentlump);
        }
               
        function dumpTillLump(lumps, start, limit) {
            for (; start < limit; ++start) {
                var text = lumps[start].text;
                if (text) { // guard against "undefined" lumps from "justended"
                    out += lumps[start].text;
                }
            }
        }
      
        function dumpScan(lumps, renderindex, basedepth, closeparent, insideleaf) {
            var start = renderindex;
            while (true) {
                if (renderindex === lumps.length) {
                    break;
                }
                var lump = lumps[renderindex];
                if (lump.nestingdepth < basedepth) {
                    break;
                }
                if (lump.rsfID !== undefined) {
                    if (!insideleaf) {break;}
                    if (insideleaf && lump.nestingdepth > basedepth + (closeparent? 0 : 1)) {
                        fluid.log("Error in component tree - leaf component found to contain further components - at " +
                            lump.toString());
                    }
                    else {break;}
                }
                // target.print(lump.text);
                ++renderindex;
            }
            // ASSUMPTIONS: close tags are ONE LUMP
            if (!closeparent && (renderindex === lumps.length || !lumps[renderindex].rsfID)) {
                --renderindex;
            }
            
            dumpTillLump(lumps, start, renderindex);
            //target.write(buffer, start, limit - start);
            return renderindex;
        }
        
        
        function isPlaceholder(value) {
            // TODO: equivalent of server-side "placeholder" system
            return false;
        }
        
        function isValue(value) {
            return value !== null && value !== undefined && !isPlaceholder(value);
        }
        
        // In RSF Client, this is a "flyweight" "global" object that is reused for every tag, 
        // to avoid generating garbage. In RSF Server, it is an argument to the following rendering
        // methods of type "TagRenderContext".
        
        var trc = {};
        
        /*** TRC METHODS ***/
        
        function openTag() {
            if (!trc.iselide) {
                out += "<" + trc.uselump.tagname;
            }
        }
        
        function closeTag() {
            if (!trc.iselide) {
                out += "</" + trc.uselump.tagname + ">";
            }
        }
      
        function renderUnchanged() {
            // TODO needs work since we don't keep attributes in text
            dumpTillLump(trc.uselump.parent.lumps, trc.uselump.lumpindex + 1,
                trc.close.lumpindex + (trc.iselide ? 0 : 1));
        }

        function isSelfClose() {
            return trc.endopen.lumpindex === trc.close.lumpindex && fluid.XMLP.closedTags[trc.uselump.tagname]; 
        }

        function dumpTemplateBody() {
            if (isSelfClose()) {
                if (!trc.iselide) {
                    out += "/>";
                }
            }
            else {
                if (!trc.iselide) {
                    out += ">";
                }
                dumpTillLump(trc.uselump.parent.lumps, trc.endopen.lumpindex,
                    trc.close.lumpindex + (trc.iselide ? 0 : 1));
            }
        }
        
        function replaceAttributes() {
            if (!trc.iselide) {
                out += fluid.dumpAttributes(trc.attrcopy);
            }
            dumpTemplateBody();
        }
      
        function replaceAttributesOpen() {
            if (trc.iselide) {
                replaceAttributes();
            }
            else {
                out += fluid.dumpAttributes(trc.attrcopy);
                var selfClose = isSelfClose();
                // TODO: the parser does not ever produce empty tags
                out += selfClose ? "/>" : ">";
          
                trc.nextpos = selfClose? trc.close.lumpindex + 1 : trc.endopen.lumpindex;
            }
        }

        function replaceBody(value) {
            out += fluid.dumpAttributes(trc.attrcopy);
            if (!trc.iselide) {
                out += ">";
            }
            out += fluid.XMLEncode(value.toString());
            closeTag();
        }
      
        function rewriteLeaf(value) {
            if (isValue(value)) {
                replaceBody(value);
            }
            else {
                replaceAttributes();
            }
        }
      
        function rewriteLeafOpen(value) {
            if (trc.iselide) {
                rewriteLeaf(trc.value);
            }
            else {
                if (isValue(value)) {
                    replaceBody(value);
                }
                else {
                    replaceAttributesOpen();
                }
            }
        }

        
        /*** END TRC METHODS**/
        
        function rewriteUrl(template, url) {
            if (renderOptions.urlRewriter) {
                var rewritten = renderOptions.urlRewriter(url);
                if (rewritten) {
                    return rewritten;
                }
            }
            if (!renderOptions.rebaseURLs) {
                return url;
            }
            var protpos = url.indexOf(":/");
            if (url.charAt(0) === '/' || protpos !== -1 && protpos < 7) { // jslint:ok
                return url;
            }
            else {
                return renderOptions.baseURL + url;
            }
        }
        
        function dumpHiddenField(/** UIParameter **/ todump) { // jslint:ok
            out += "<input type=\"hidden\" ";
            var isvirtual = todump.virtual;
            var outattrs = {};
            outattrs[isvirtual? "id" : "name"] = todump.name;
            outattrs.value = todump.value;
            out += fluid.dumpAttributes(outattrs);
            out += " />\n";
        }
        
        var outDecoratorsImpl;
        
        function applyAutoBind(torender, finalID) {
            if (!finalID) {
              // if no id is assigned so far, this is a signal that this is a "virtual" component such as
              // a non-HTML UISelect which will not have physical markup.
                return; 
            }
            var tagname = trc.uselump.tagname;
            var applier = renderOptions.applier;
            function applyFunc() {
                fluid.applyBoundChange(fluid.byId(finalID, renderOptions.document), undefined, applier);
            }
            if (renderOptions.autoBind && /input|select|textarea/.test(tagname) 
                    && !renderedbindings[finalID]) {
                var decorators = [{jQuery: ["change", applyFunc]}];
                // Work around bug 193: http://webbugtrack.blogspot.com/2007/11/bug-193-onchange-does-not-fire-properly.html
                if ($.browser.msie && tagname === "input" 
                        && /radio|checkbox/.test(trc.attrcopy.type)) {
                    decorators.push({jQuery: ["click", applyFunc]});
                }
                if ($.browser.safari && tagname === "input" && trc.attrcopy.type === "radio") {
                    decorators.push({jQuery: ["keyup", applyFunc]});
                }
                outDecoratorsImpl(torender, decorators, trc.attrcopy, finalID); // jslint:ok - forward reference
            }    
        }
        
        function dumpBoundFields(/** UIBound**/ torender, parent) { // jslint:ok - whitespace
            if (torender) {
                var holder = parent? parent : torender;
                if (renderOptions.fossils && holder.valuebinding) {
                    var fossilKey = holder.submittingname || torender.finalID;
                  // TODO: this will store multiple times for each member of a UISelect
                    renderOptions.fossils[fossilKey] = {
                        name: fossilKey,
                        EL: holder.valuebinding,
                        oldvalue: holder.value
                    };
                  // But this has to happen multiple times
                    applyAutoBind(torender, torender.finalID);
                }
                if (torender.fossilizedbinding) {
                    dumpHiddenField(torender.fossilizedbinding);
                }
                if (torender.fossilizedshaper) {
                    dumpHiddenField(torender.fossilizedshaper);
                }
            }
        }
        
        function dumpSelectionBindings(uiselect) {
            if (!renderedbindings[uiselect.selection.fullID]) {
                renderedbindings[uiselect.selection.fullID] = true; // set this true early so that selection does not autobind twice
                dumpBoundFields(uiselect.selection);
                dumpBoundFields(uiselect.optionlist);
                dumpBoundFields(uiselect.optionnames);
            }
        }
          
        function isSelectedValue(torender, value) {
            var selection = torender.selection;
            return selection.value && typeof(selection.value) !== "string" && typeof(selection.value.length) === "number" ? 
                $.inArray(value, selection.value) !== -1 :
                selection.value === value;
        }
        
        function getRelativeComponent(component, relativeID) {
            component = component.parent;
            while (relativeID.indexOf("..::") === 0) {
                relativeID = relativeID.substring(4);
                component = component.parent;
            }
            return component.childmap[relativeID];
        }
        
        // TODO: This mechanism inefficiently handles the rare case of a target document
        // id collision requiring a rewrite for FLUID-5048. In case it needs improving, we
        // could hold an inverted index - however, these cases will become even rarer with FLUID-5047
        function rewriteRewriteMap (from, to) {
            fluid.each(rewritemap, function (value, key) {
                if (value === from) {
                    rewritemap[key] = to;
                }  
            });
        }
        
        function adjustForID(attrcopy, component, late, forceID) {
            if (!late) {
                delete attrcopy["rsf:id"];
            }
            if (component.finalID !== undefined) {
                attrcopy.id = component.finalID;
            }
            else if (forceID !== undefined) {
                attrcopy.id = forceID;
            }
            else {
                if (attrcopy.id || late) {
                    attrcopy.id = component.fullID;
                }
            }
            
            var count = 1;
            var baseid = attrcopy.id;
            while (renderOptions.document.getElementById(attrcopy.id) || usedIDs[attrcopy.id]) {
                attrcopy.id = baseid + "-" + (count++); 
            }
            if (count !== 1) {
                rewriteRewriteMap(baseid, attrcopy.id);
            }
            component.finalID = attrcopy.id;
            return attrcopy.id;
        }
        
        function assignSubmittingName(attrcopy, component, parent) {
            var submitting = parent || component;
          // if a submittingName is required, we must already go out to the document to 
          // uniquify the id that it will be derived from
            adjustForID(attrcopy, component, true, component.fullID);
            if (submitting.submittingname === undefined && submitting.willinput !== false) {
                submitting.submittingname = submitting.finalID || submitting.fullID;
            }
            return submitting.submittingname;
        }
             
        function explodeDecorators(decorators) {
            var togo = [];
            if (decorators.type) {
                togo[0] = decorators;
            }
            else {
                for (var key in decorators) {
                    if (key === "$") {key = "jQuery";}
                    var value = decorators[key];
                    var decorator = {
                        type: key
                    };
                    if (key === "jQuery") {
                        decorator.func = value[0];
                        decorator.args = value.slice(1);
                    }
                    else if (key === "addClass" || key === "removeClass") {
                        decorator.classes = value;
                    }
                    else if (key === "attrs") {
                        decorator.attributes = value;
                    }
                    else if (key === "identify") {
                        decorator.key = value;
                    }
                    togo[togo.length] = decorator;
                }
            }
            return togo;
        }
        
        outDecoratorsImpl = function(torender, decorators, attrcopy, finalID) {
            renderOptions.idMap = renderOptions.idMap || {};
            for (var i = 0; i < decorators.length; ++i) {
                var decorator = decorators[i];
                var type = decorator.type;
                if (!type) {
                    var explodedDecorators = explodeDecorators(decorator);
                    outDecoratorsImpl(torender, explodedDecorators, attrcopy, finalID);
                    continue;
                }
                if (type === "$") {type = decorator.type = "jQuery";}
                if (type === "jQuery" || type === "event" || type === "fluid") {
                    var id = adjustForID(attrcopy, torender, true, finalID);
                    if (decorator.ids === undefined) {
                        decorator.ids = [];
                        decoratorQueue[decoratorQueue.length] = decorator; 
                    }
                    decorator.ids.push(id);
                }
                // honour these remaining types immediately
                else if (type === "attrs") {
                    fluid.each(decorator.attributes, function(value, key) {
                        if (value === null || value === undefined) {
                            delete attrcopy[key];
                        }
                        else {
                            attrcopy[key] = fluid.XMLEncode(value);
                        }
                    }); // jslint:ok - function within loop
                }
                else if (type === "addClass" || type === "removeClass") {
                    var fakeNode = {
                        nodeType: 1,
                        className: attrcopy["class"] || ""
                    };
                    renderOptions.jQuery(fakeNode)[type](decorator.classes);
                    attrcopy["class"] = fakeNode.className;
                }
                else if (type === "identify") {
                    var id = adjustForID(attrcopy, torender, true, finalID); // jslint:ok - scoping
                    renderOptions.idMap[decorator.key] = id;
                }
                else if (type !== "null") {
                    fluid.log("Unrecognised decorator of type " + type + " found at component of ID " + finalID);
                }
            }
        };
        
        function outDecorators(torender, attrcopy) {
            if (!torender.decorators) {return;}
            if (torender.decorators.length === undefined) {
                torender.decorators = explodeDecorators(torender.decorators);
            }
            outDecoratorsImpl(torender, torender.decorators, attrcopy);
        }
        
        function dumpBranchHead(branch, targetlump) {
            if (targetlump.elide) {
                return;
            }
            var attrcopy = {};
            $.extend(true, attrcopy, targetlump.attributemap);
            adjustForID(attrcopy, branch); // jslint:ok - forward reference
            outDecorators(branch, attrcopy);
            out += "<" + targetlump.tagname + " ";
            out += fluid.dumpAttributes(attrcopy);
            out += ">";
        }
        
        function resolveArgs(args) {
            if (!args) {return args;}
            args = fluid.copy(args); // FLUID-4737: Avoid corrupting material which may have been fetched from the model
            return fluid.transform(args, function (arg, index) {
                upgradeBound(args, index, renderOptions.model, renderOptions.resolverGetConfig);
                return args[index].value;
            });
        }
            
        function degradeMessage(torender) {
            if (torender.componentType === "UIMessage") {
                // degrade UIMessage to UIBound by resolving the message
                torender.componentType = "UIBound";
                if (!renderOptions.messageLocator) {
                    torender.value = "[No messageLocator is configured in options - please consult documentation on options.messageSource]";
                }
                else {
                    upgradeBound(torender, "messagekey", renderOptions.model, renderOptions.resolverGetConfig);
                    var resArgs = resolveArgs(torender.args);
                    torender.value = renderOptions.messageLocator(torender.messagekey.value, resArgs);
                }
            }
        }  
        
          
        function renderComponent(torender) {
            var attrcopy = trc.attrcopy;
            
            degradeMessage(torender);
            var componentType = torender.componentType;
            var tagname = trc.uselump.tagname;
            
            outDecorators(torender, attrcopy);
            
            function makeFail(torender, end) {
                fluid.fail("Error in component tree - UISelectChoice with id " + torender.fullID + end);
            } 
            
            if (componentType === "UIBound" || componentType === "UISelectChoice") {
                var parent;
                if (torender.choiceindex !== undefined) {
                    if (torender.parentRelativeID !== undefined) {
                        parent = getRelativeComponent(torender, torender.parentRelativeID);
                        if (!parent) {
                            makeFail(torender, " has parentRelativeID of " + torender.parentRelativeID + " which cannot be resolved");
                        }
                    }
                    else {
                        makeFail(torender, " does not have parentRelativeID set");
                    }
                    assignSubmittingName(attrcopy, torender, parent.selection);
                    dumpSelectionBindings(parent);
                }
        
                var submittingname = parent? parent.selection.submittingname : torender.submittingname;
                if (!parent && torender.valuebinding) {
                    // Do this for all bound fields even if non submitting so that finalID is set in order to track fossils (FLUID-3387)
                    submittingname = assignSubmittingName(attrcopy, torender);
                }
                if (tagname === "input" || tagname === "textarea") {
                    if (submittingname !== undefined) {
                        attrcopy.name = submittingname;
                    }
                }
                // this needs to happen early on the client, since it may cause the allocation of the
                // id in the case of a "deferred decorator". However, for server-side bindings, this 
                // will be an inappropriate time, unless we shift the timing of emitting the opening tag.
                dumpBoundFields(torender, parent? parent.selection : null);
          
                if (typeof(torender.value) === 'boolean' || attrcopy.type === "radio" 
                        || attrcopy.type === "checkbox") {
                    var underlyingValue;
                    var directValue = torender.value;
                    
                    if (torender.choiceindex !== undefined) {
                        if (!parent.optionlist.value) {
                            fluid.fail("Error in component tree - selection control with full ID " + parent.fullID + " has no values");
                        }
                        underlyingValue = parent.optionlist.value[torender.choiceindex];
                        directValue = isSelectedValue(parent, underlyingValue);
                    }
                    if (isValue(directValue)) {
                        if (directValue) {
                            attrcopy.checked = "checked";
                        }
                        else {
                            delete attrcopy.checked;
                        }
                    }
                    attrcopy.value = fluid.XMLEncode(underlyingValue? underlyingValue : "true");
                    rewriteLeaf(null);
                }
                else if (fluid.isArrayable(torender.value)) {
                    // Cannot be rendered directly, must be fake
                    renderUnchanged();
                }
                else { // String value
                    var value = parent? 
                        parent[tagname === "textarea" || tagname === "input" ? "optionlist" : "optionnames"].value[torender.choiceindex] : 
                            torender.value; // jslint:ok - whitespace
                    if (tagname === "textarea") {
                        if (isPlaceholder(value) && torender.willinput) {
                            // FORCE a blank value for input components if nothing from
                            // model, if input was intended.
                            value = "";
                        }
                        rewriteLeaf(value);
                    }
                    else if (tagname === "input") {
                        if (torender.willinput || isValue(value)) {
                            attrcopy.value = fluid.XMLEncode(String(value));
                        }
                        rewriteLeaf(null);
                    }
                    else {
                        delete attrcopy.name;
                        rewriteLeafOpen(value);
                    }
                }
            }
            else if (componentType === "UISelect") {
  
                var ishtmlselect = tagname === "select";
                var ismultiple = false;
          
                if (fluid.isArrayable(torender.selection.value)) {
                    ismultiple = true;
                    if (ishtmlselect) {
                        attrcopy.multiple = "multiple";
                    }
                }
                // assignSubmittingName is now the definitive trigger point for uniquifying output IDs
                // However, if id is already assigned it is probably through attempt to decorate root select.
                // in this case restore it.
                assignSubmittingName(attrcopy, torender.selection);
                
                if (ishtmlselect) {
                    // The HTML submitted value from a <select> actually corresponds
                    // with the selection member, not the top-level component.
                    if (torender.selection.willinput !== false) {
                        attrcopy.name = torender.selection.submittingname;
                    }
                    applyAutoBind(torender, attrcopy.id);
                }
                
                out += fluid.dumpAttributes(attrcopy);
                if (ishtmlselect) {
                    out += ">";
                    var values = torender.optionlist.value;
                    var names = torender.optionnames === null || torender.optionnames === undefined || !torender.optionnames.value? values : torender.optionnames.value;
                    if (!names || !names.length) {
                        fluid.fail("Error in component tree - UISelect component with fullID " 
                            + torender.fullID + " does not have optionnames set");
                    }
                    for (var i = 0; i < names.length; ++i) {
                        out += "<option value=\"";
                        var value = values[i]; //jslint:ok - scoping
                        if (value === null) {
                            value = fluid.NULL_STRING;
                        }
                        out += fluid.XMLEncode(value);
                        if (isSelectedValue(torender, value)) {
                            out += "\" selected=\"selected";
                        }
                        out += "\">";
                        out += fluid.XMLEncode(names[i]);
                        out += "</option>\n";
                    }
                    closeTag();
                }
                else {
                    dumpTemplateBody();
                }
                dumpSelectionBindings(torender);
            }
            else if (componentType === "UILink") {
                var attrname = LINK_ATTRIBUTES[tagname];
                if (attrname) {
                    degradeMessage(torender.target);
                    var target = torender.target.value;
                    if (!isValue(target)) {
                        target = attrcopy[attrname];
                    }
                    target = rewriteUrl(trc.uselump.parent, target);
                    // Note that all real browsers succeed in recovering the URL here even if it is presented in violation of XML
                    // seemingly due to the purest accident, the text &amp; cannot occur in a properly encoded URL :P
                    attrcopy[attrname] = fluid.XMLEncode(target);
                }
                var value; // jslint:ok
                if (torender.linktext) { 
                    degradeMessage(torender.linktext);
                    value = torender.linktext.value; // jslint:ok - scoping
                }
                if (!isValue(value)) {
                    replaceAttributesOpen();
                }
                else {
                    rewriteLeaf(value);
                }
            }
            
            else if (torender.markup !== undefined) { // detect UIVerbatim
                degradeMessage(torender.markup);
                var rendered = torender.markup.value;
                if (rendered === null) {
                  // TODO, doesn't quite work due to attr folding cf Java code
                    out += fluid.dumpAttributes(attrcopy);
                    out += ">";
                    renderUnchanged(); 
                }
                else {
                    if (!trc.iselide) {
                        out += fluid.dumpAttributes(attrcopy);
                        out += ">";
                    }
                    out += rendered;
                    closeTag();
                }
            }
            if (attrcopy.id !== undefined) {
                usedIDs[attrcopy.id] = true;
            }
        }
             
        function rewriteIDRelation(context) {
            var attrname;
            var attrval = trc.attrcopy["for"];
            if (attrval !== undefined) {
                attrname = "for";
            }
            else {
                attrval = trc.attrcopy.headers;
                if (attrval !== undefined) {
                    attrname = "headers";
                }
            }
            if (!attrname) {return;}
            var tagname = trc.uselump.tagname;
            if (attrname === "for" && tagname !== "label") {return;}
            if (attrname === "headers" && tagname !== "td" && tagname !== "th") {return;}
            var rewritten = rewritemap[getRewriteKey(trc.uselump.parent, context, attrval)];
            if (rewritten !== undefined) {
                trc.attrcopy[attrname] = rewritten;
            }
        }
        
        function renderComment(message) {
            out += ("<!-- " + fluid.XMLEncode(message) + "-->");
        }
        
        function renderDebugMessage(message) {
            out += "<span style=\"background-color:#FF466B;color:white;padding:1px;\">";
            out += message;
            out += "</span><br/>";
        }
        
        function reportPath(/*UIComponent*/ branch) { // jslint:ok - whitespace
            var path = branch.fullID;
            return !path ? "component tree root" : "full path " + path;
        }
        
        function renderComponentSystem(context, torendero, lump) {
            var lumpindex = lump.lumpindex;
            var lumps = lump.parent.lumps;
            var nextpos = -1;
            var outerendopen = lumps[lumpindex + 1];
            var outerclose = lump.close_tag;
        
            nextpos = outerclose.lumpindex + 1;
        
            var payloadlist = lump.downmap? lump.downmap["payload-component"] : null;
            var payload = payloadlist? payloadlist[0] : null;
            
            var iselide = lump.rsfID.charCodeAt(0) === 126; // "~"
            
            var endopen = outerendopen;
            var close = outerclose;
            var uselump = lump;
            var attrcopy = {};
            $.extend(true, attrcopy, (payload === null? lump : payload).attributemap);
            
            trc.attrcopy = attrcopy;
            trc.uselump = uselump;
            trc.endopen = endopen;
            trc.close = close;
            trc.nextpos = nextpos;
            trc.iselide = iselide;
            
            rewriteIDRelation(context);
            
            if (torendero === null) {
                if (lump.rsfID.indexOf("scr=") === (iselide? 1 : 0)) {
                    var scrname = lump.rsfID.substring(4 + (iselide? 1 : 0));
                    if (scrname === "ignore") {
                        nextpos = trc.close.lumpindex + 1;
                    }
                    else if (scrname === "rewrite-url") {
                        torendero = {componentType: "UILink", target: {}};
                    }
                    else {
                        openTag();
                        replaceAttributesOpen();
                        nextpos = trc.endopen.lumpindex;
                    }
                }
            }
            if (torendero !== null) {
                // else there IS a component and we are going to render it. First make
                // sure we render any preamble.
          
                if (payload) {
                    trc.endopen = lumps[payload.lumpindex + 1];
                    trc.close = payload.close_tag;
                    trc.uselump = payload;
                    dumpTillLump(lumps, lumpindex, payload.lumpindex);
                    lumpindex = payload.lumpindex;
                }
          
                adjustForID(attrcopy, torendero);
                //decoratormanager.decorate(torendero.decorators, uselump.getTag(), attrcopy);
                
                // ALWAYS dump the tag name, this can never be rewritten. (probably?!)
                openTag();
          
                renderComponent(torendero);
                // if there is a payload, dump the postamble.
                if (payload !== null) {
                    // the default case is initialised to tag close
                    if (trc.nextpos === nextpos) {
                        dumpTillLump(lumps, trc.close.lumpindex + 1, outerclose.lumpindex + 1);
                    }
                }
                nextpos = trc.nextpos;
            }
            return nextpos;
        }
        var renderRecurse;
        
        function renderContainer(child, targetlump) {
            var t2 = targetlump.parent;
            var firstchild = t2.lumps[targetlump.lumpindex + 1];
            if (child.children !== undefined) {
                dumpBranchHead(child, targetlump);
            }
            else {
                renderComponentSystem(child.parent, child, targetlump);
            }
            renderRecurse(child, targetlump, firstchild);
        }
        
        fetchComponent = function(basecontainer, id, lump) {
            if (id.indexOf("msg=") === 0) {
                var key = id.substring(4);
                return {componentType: "UIMessage", messagekey: key};
            }
            while (basecontainer) {
                var togo = basecontainer.childmap[id];
                if (togo) {
                    return togo;
                }
                basecontainer = basecontainer.parent;
            }
            return null;
        };
      
        function fetchComponents(basecontainer, id) {
            var togo;
            while (basecontainer) {
                togo = basecontainer.childmap[id];
                if (togo) {
                    break;
                }
                basecontainer = basecontainer.parent;
            }
            return togo;
        }
      
        function findChild(sourcescope, child) {
            var split = fluid.SplitID(child.ID);
            var headlumps = sourcescope.downmap[child.ID];
            if (!headlumps) {
                headlumps = sourcescope.downmap[split.prefix + ":"];
            }
            return headlumps? headlumps[0] : null;
        }
        
        renderRecurse = function(basecontainer, parentlump, baselump) {
            var renderindex = baselump.lumpindex;
            var basedepth = parentlump.nestingdepth;
            var t1 = parentlump.parent;
            var rendered;
            if (debugMode) {
                rendered = {};
            }
            while (true) {
                renderindex = dumpScan(t1.lumps, renderindex, basedepth, !parentlump.elide, false);
                if (renderindex === t1.lumps.length) { 
                    break;
                }
                var lump = t1.lumps[renderindex];      
                var id = lump.rsfID;
                // new stopping rule - we may have been inside an elided tag
                if (lump.nestingdepth < basedepth || id === undefined) {
                    break;
                } 
          
                if (id.charCodeAt(0) === 126) { // "~"
                    id = id.substring(1);
                }
                
                //var ismessagefor = id.indexOf("message-for:") === 0;
                
                if (id.indexOf(':') !== -1) {
                    var prefix = fluid.getPrefix(id);
                    var children = fetchComponents(basecontainer, prefix);
                    
                    var finallump = lump.uplump.finallump[prefix];
                    var closefinal = finallump.close_tag;
                    
                    if (children) {
                        for (var i = 0; i < children.length; ++i) {
                            var child = children[i];
                            if (child.children) { // it is a branch 
                                if (debugMode) {
                                    rendered[child.fullID] = true;
                                }
                                var targetlump = branchmap[child.fullID];
                                if (targetlump) {
                                    if (debugMode) {
                                        renderComment("Branching for " + child.fullID + " from "
                                            + fluid.debugLump(lump) + " to " + fluid.debugLump(targetlump));
                                    }
                                    
                                    renderContainer(child, targetlump);
                                    
                                    if (debugMode) {
                                        renderComment("Branch returned for " + child.fullID
                                            + fluid.debugLump(lump) + " to " + fluid.debugLump(targetlump));
                                    }
                                }
                                else if (debugMode) {
                                    renderDebugMessage(
                                        "No matching template branch found for branch container with full ID "
                                            + child.fullID
                                            + " rendering from parent template branch "
                                            + fluid.debugLump(baselump)); // jslint:ok - line breaking
                                }
                            }
                            else { // repetitive leaf
                                var targetlump = findChild(parentlump, child); // jslint:ok - scoping
                                if (!targetlump) {
                                    if (debugMode) {
                                        renderDebugMessage("Repetitive leaf with full ID " + child.fullID
                                            + " could not be rendered from parent template branch "
                                            + fluid.debugLump(baselump)); // jslint:ok - line breaking
                                    }
                                    continue;
                                }
                                var renderend = renderComponentSystem(basecontainer, child, targetlump);
                                var wasopentag = renderend < t1.lumps.lengtn && t1.lumps[renderend].nestingdepth >= targetlump.nestingdepth;
                                var newbase = child.children? child : basecontainer;
                                if (wasopentag) {
                                    renderRecurse(newbase, targetlump, t1.lumps[renderend]);
                                    renderend = targetlump.close_tag.lumpindex + 1;
                                }
                                if (i !== children.length - 1) {
                                    // TODO - fix this bug in RSF Server!
                                    if (renderend < closefinal.lumpindex) {
                                        dumpScan(t1.lumps, renderend, targetlump.nestingdepth - 1, false, false);
                                    }
                                }
                                else {
                                    dumpScan(t1.lumps, renderend, targetlump.nestingdepth, true, false);
                                }
                            }
                        } // end for each repetitive child
                    }
                    else {
                        if (debugMode) {
                            renderDebugMessage("No branch container with prefix "
                                + prefix + ": found in container "
                                + reportPath(basecontainer)
                                + " rendering at template position " + fluid.debugLump(baselump)
                                + ", skipping");
                        }
                    }
                    
                    renderindex = closefinal.lumpindex + 1;
                    if (debugMode) {
                        renderComment("Stack returned from branch for ID " + id + " to "
                            + fluid.debugLump(baselump) + ": skipping from " + fluid.debugLump(lump)
                            + " to " + fluid.debugLump(closefinal));
                    }
                }
                else {
                    var component;
                    if (id) {
                        component = fetchComponent(basecontainer, id, lump);
                        if (debugMode && component) {
                            rendered[component.fullID] = true;
                        }
                    }
                    if (component && component.children !== undefined) {
                        renderContainer(component);
                        renderindex = lump.close_tag.lumpindex + 1;
                    }
                    else {
                        renderindex = renderComponentSystem(basecontainer, component, lump);
                    }
                }
                if (renderindex === t1.lumps.length) {
                    break;
                }
            }
            if (debugMode) {
                var children = basecontainer.children; // jslint:ok - scoping
                for (var key = 0; key < children.length; ++key) {
                    var child = children[key]; // jslint:ok - scoping
                    if (!rendered[child.fullID]) {
                        renderDebugMessage("Component "
                            + child.componentType + " with full ID "
                            + child.fullID + " could not be found within template "
                            + fluid.debugLump(baselump));
                    }
                }
            }  
            
        };
        
        function renderCollect(collump) {
            dumpTillLump(collump.parent.lumps, collump.lumpindex, collump.close_tag.lumpindex + 1);
        }
        
        // Let us pray
        function renderCollects() {
            for (var key in collected) {
                var collist = collected[key];
                for (var i = 0; i < collist.length; ++i) {
                    renderCollect(collist[i]);
                }
            }
        }
        
        function processDecoratorQueue() {
            for (var i = 0; i < decoratorQueue.length; ++i) {
                var decorator = decoratorQueue[i];
                for (var j = 0; j < decorator.ids.length; ++j) {
                    var id = decorator.ids[j];
                    var node = fluid.byId(id, renderOptions.document);
                    if (!node) {
                        fluid.fail("Error during rendering - component with id " + id 
                            + " which has a queued decorator was not found in the output markup");
                    }
                    if (decorator.type === "jQuery") {
                        var jnode = renderOptions.jQuery(node);
                        jnode[decorator.func].apply(jnode, fluid.makeArray(decorator.args));
                    }
                    else if (decorator.type === "fluid") {
                        var args = decorator.args;
                        if (!args) {
                            var thisContainer = renderOptions.jQuery(node);
                            if (!decorator.container) {
                                decorator.container = thisContainer;
                            }
                            else {
                                decorator.container.push(node);
                            }
                            args = [thisContainer, decorator.options];
                        }
                        var that = renderer.invokeFluidDecorator(decorator.func, args, id, i, options);
                        decorator.that = that;
                    }
                    else if (decorator.type === "event") {
                        node[decorator.event] = decorator.handler; 
                    }
                }
            }
        }
  
        that.renderTemplates = function () {
            tree = fixupTree(tree, options.model, options.resolverGetConfig);
            var template = templates[0];
            resolveBranches(templates.globalmap, tree, template.rootlump);
            renderedbindings = {};
            renderCollects();
            renderRecurse(tree, template.rootlump, template.lumps[template.firstdocumentindex]);
            return out;
        };  
        
        that.processDecoratorQueue = function () {
            processDecoratorQueue();
        };
        return that;
        
    };
    
    jQuery.extend(true, fluid.renderer, renderer);
  
    /*
     * This function is unsupported: It is not really intended for use by implementors.
     */
    fluid.ComponentReference = function (reference) {
        this.reference = reference;
    };
    
    // Explodes a raw "hash" into a list of UIOutput/UIBound entries
    fluid.explode = function (hash, basepath) {
        var togo = [];
        for (var key in hash) {
            var binding = basepath === undefined ? key : basepath + "." + key;
            togo[togo.length] = {ID: key, value: hash[key], valuebinding: binding};
        }
        return togo;
    };
      
    
   /**
    * A common utility function to make a simple view of rows, where each row has a selection control and a label
    * @param {Object} optionlist An array of the values of the options in the select
    * @param {Object} opts An object with this structure: {
            selectID: "",         
            rowID: "",            
            inputID: "",
            labelID: ""
        }
    */ 
    fluid.explodeSelectionToInputs = function (optionlist, opts) {
        return fluid.transform(optionlist, function (option, index) {
            return {
                ID: opts.rowID, 
                children: [
                    {ID: opts.inputID, parentRelativeID: "..::" + opts.selectID, choiceindex: index},
                    {ID: opts.labelID, parentRelativeID: "..::" + opts.selectID, choiceindex: index}]
            };
        });
    };
  
    fluid.resolveMessageSource = function (messageSource) {
        if (messageSource.type === "data") {
            if (messageSource.url === undefined) {
                return fluid.messageLocator(messageSource.messages, messageSource.resolveFunc);
            }
            else {
              // TODO: fetch via AJAX, and convert format if necessary
            }
        } // jslint:ok - empty block
        else if (messageSource.type === "resolver") {
            return messageSource.resolver.resolve;
        }
    };
    
    fluid.renderTemplates = function (templates, tree, options, fossilsIn) {
        var renderer = fluid.renderer(templates, tree, options, fossilsIn);
        var rendered = renderer.renderTemplates();
        return rendered;
    };
    /** A driver to render and bind an already parsed set of templates onto
     * a node. See documentation for fluid.selfRender.
     * @param templates A parsed template set, as returned from fluid.selfRender or 
     * fluid.parseTemplates.
     */
  
    fluid.reRender = function (templates, node, tree, options) {
        options = options || {};
        var renderer = fluid.renderer(templates, tree, options, options.fossils);
        options = renderer.options;
              // Empty the node first, to head off any potential id collisions when rendering
        node = fluid.unwrap(node);
        var lastFocusedElement = fluid.getLastFocusedElement ? fluid.getLastFocusedElement() : null;
        var lastId;
        if (lastFocusedElement && fluid.dom.isContainer(node, lastFocusedElement)) {
            lastId = lastFocusedElement.id;
        }
        if ($.browser.msie) {
            options.jQuery(node).empty(); //- this operation is very slow.
        }
        else {
            node.innerHTML = "";
        }
        
        var rendered = renderer.renderTemplates();
        if (options.renderRaw) {
            rendered = fluid.XMLEncode(rendered);
            rendered = rendered.replace(/\n/g, "<br/>");
        }
        if (options.model) {
            fluid.bindFossils(node, options.model, options.fossils);
        }
        if ($.browser.msie) {
            options.jQuery(node).html(rendered);
        }
        else {
            node.innerHTML = rendered;
        }
        renderer.processDecoratorQueue();
        if (lastId) {
            var element = fluid.byId(lastId, options.document);
            if (element) {
                options.jQuery(element).focus();
            }      
        }
          
        return templates;
    };
  
    function findNodeValue(rootNode) {
        var node = fluid.dom.iterateDom(rootNode, function (node) {
          // NB, in Firefox at least, comment and cdata nodes cannot be distinguished!
            return node.nodeType === 8 || node.nodeType === 4 ? "stop" : null;
            }, true); // jslint:ok
        var value = node.nodeValue;
        if (value.indexOf("[CDATA[") === 0) {
            return value.substring(6, value.length - 2);
        }
        else {
            return value;
        }
    }
  
    fluid.extractTemplate = function (node, armouring) {
        if (!armouring) {
            return node.innerHTML;
        }
        else {
            return findNodeValue(node);
        }
    };
    /** A slightly generalised version of fluid.selfRender that does not assume that the
     * markup used to source the template is within the target node.
     * @param source Either a structure {node: node, armouring: armourstyle} or a string
     * holding a literal template
     * @param target The node to receive the rendered markup
     * @param tree, options, return as for fluid.selfRender
     */
    fluid.render = function (source, target, tree, options) {
        options = options || {};
        var template = source;
        if (typeof(source) === "object") {
            template = fluid.extractTemplate(fluid.unwrap(source.node), source.armouring);
        }
        target = fluid.unwrap(target);
        var resourceSpec = {base: {resourceText: template, 
                            href: ".", resourceKey: ".", cutpoints: options.cutpoints}
                            };
        var templates = fluid.parseTemplates(resourceSpec, ["base"], options);
        return fluid.reRender(templates, target, tree, options);    
    };
    
    /** A simple driver for single node self-templating. Treats the markup for a
     * node as a template, parses it into a template structure, renders it using
     * the supplied component tree and options, then replaces the markup in the 
     * node with the rendered markup, and finally performs any required data
     * binding. The parsed template is returned for use with a further call to
     * reRender.
     * @param node The node both holding the template, and whose markup is to be
     * replaced with the rendered result.
     * @param tree The component tree to be rendered.
     * @param options An options structure to configure the rendering and binding process.
     * @return A templates structure, suitable for a further call to fluid.reRender or
     * fluid.renderTemplates.
     */  
    fluid.selfRender = function (node, tree, options) {
        options = options || {};
        return fluid.render({node: node, armouring: options.armouring}, node, tree, options);
    };

})(jQuery, fluid_1_5);
/*
Copyright 2008-2010 University of Cambridge
Copyright 2008-2009 University of Toronto
Copyright 2010-2011 Lucendo Development Ltd.

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global fluid_1_5:true, jQuery*/

// JSLint options 
/*jslint white: true, funcinvoke: true, continue: true, elsecatch: true, operator: true, jslintok:true, undef: true, newcap: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

fluid_1_5 = fluid_1_5 || {};

(function ($, fluid) {

    if (!fluid.renderer) {
        fluid.fail("fluidRenderer.js is a necessary dependency of RendererUtilities");
    }
    
    /** Returns an array of size count, filled with increasing integers, 
     *  starting at 0 or at the index specified by first. 
     */
    
    fluid.iota = function (count, first) {
        first = first || 0;
        var togo = [];
        for (var i = 0; i < count; ++i) {
            togo[togo.length] = first++;
        }
        return togo;
    };

    // TODO: API status of these 3 functions is uncertain. So far, they have never
    // appeared in documentation.
    fluid.renderer.visitDecorators = function(that, visitor) {
        fluid.visitComponentChildren(that, function(component, name) {
            if (name.indexOf(fluid.renderer.decoratorComponentPrefix) === 0) {
                visitor(component, name);
            }
        }, {flat: true});  
    };

    fluid.renderer.clearDecorators = function(that) {
        var instantiator = fluid.getInstantiator(that);
        fluid.renderer.visitDecorators(that, function(component, name) {
            instantiator.clearComponent(that, name);
        });
    };
    
    fluid.renderer.getDecoratorComponents = function(that) {
        var togo = {};
        fluid.renderer.visitDecorators(that, function(component, name) {
            togo[name] = component;
        });
        return togo;
    };

    // Utilities for coordinating options in renderer components - this code is all pretty
    // dreadful and needs to be organised as a suitable set of defaults and policies
    fluid.renderer.modeliseOptions = function (options, defaults, baseOptions) {
        return $.extend({}, defaults, options, fluid.filterKeys(baseOptions, ["model", "applier"]));
    };
    fluid.renderer.reverseMerge = function (target, source, names) {
        names = fluid.makeArray(names);
        fluid.each(names, function (name) {
            if (target[name] === undefined && source[name] !== undefined) {
                target[name] = source[name];
            }
        });
    };

    /** "Renderer component" infrastructure **/
  // TODO: fix this up with IoC and improved handling of templateSource as well as better 
  // options layout (model appears in both rOpts and eOpts)
    fluid.renderer.createRendererSubcomponent = function (container, selectors, options, parentThat, fossils) {
        options = options || {};
        var source = options.templateSource ? options.templateSource : {node: $(container)};
        var rendererOptions = fluid.renderer.modeliseOptions(options.rendererOptions, null, parentThat);
        rendererOptions.fossils = fossils || {};
        if (container.jquery) {
            var cascadeOptions = {
                document: container[0].ownerDocument,
                jQuery: container.constructor  
            };
            fluid.renderer.reverseMerge(rendererOptions, cascadeOptions, fluid.keys(cascadeOptions));
        }
        
        var expanderOptions = fluid.renderer.modeliseOptions(options.expanderOptions, {ELstyle: "${}"}, parentThat);
        fluid.renderer.reverseMerge(expanderOptions, options, ["resolverGetConfig", "resolverSetConfig"]);
        var that = {};
        if (!options.noexpand) {
            that.expander = fluid.renderer.makeProtoExpander(expanderOptions, parentThat);
        }
        
        var templates = null;
        that.render = function (tree) {
            var cutpointFn = options.cutpointGenerator || "fluid.renderer.selectorsToCutpoints";
            rendererOptions.cutpoints = rendererOptions.cutpoints || fluid.invokeGlobalFunction(cutpointFn, [selectors, options]);
            container = typeof(container) === "function" ? container() : $(container);
              
            if (templates) {
                fluid.clear(rendererOptions.fossils);
                fluid.reRender(templates, container, tree, rendererOptions);
            } 
            else {
                if (typeof(source) === "function") { // TODO: make a better attempt than this at asynchrony
                    source = source();  
                }
                templates = fluid.render(source, container, tree, rendererOptions);
            }
        };
        return that;
    };
    
    fluid.defaults("fluid.rendererComponent", {
        gradeNames: ["fluid.viewComponent"],
        initFunction: "fluid.initRendererComponent",
        mergePolicy: {
            protoTree: "noexpand, replace",
            parentBundle: "nomerge",
            "changeApplierOptions.resolverSetConfig": "resolverSetConfig"
        },
        rendererOptions: {
            autoBind: true
        },
        events: {
            prepareModelForRender: null,
            onRenderTree: null,
            afterRender: null,
            produceTree: "unicast"
        }
    });

    fluid.initRendererComponent = function (componentName, container, options) {
        var that = fluid.initView(componentName, container, options, {gradeNames: ["fluid.rendererComponent"]});
        
        fluid.fetchResources(that.options.resources); // TODO: deal with asynchrony
        
        var rendererOptions = fluid.renderer.modeliseOptions(that.options.rendererOptions, null, that);
        if (!that.options.noUpgradeDecorators) {
            rendererOptions.parentComponent = that;
        }
        var messageResolver;
        if (!rendererOptions.messageSource && that.options.strings) {
            messageResolver = fluid.messageResolver({
                messageBase: that.options.strings,
                resolveFunc: that.options.messageResolverFunction,
                parents: fluid.makeArray(that.options.parentBundle)
            });
            rendererOptions.messageSource = {type: "resolver", resolver: messageResolver}; 
        }
        fluid.renderer.reverseMerge(rendererOptions, that.options, ["resolverGetConfig", "resolverSetConfig"]);


        var rendererFnOptions = $.extend({}, that.options.rendererFnOptions, { 
            rendererOptions: rendererOptions,
            repeatingSelectors: that.options.repeatingSelectors,
            selectorsToIgnore: that.options.selectorsToIgnore,
            expanderOptions: {
                envAdd: {styles: that.options.styles}
            }
        });
           
        if (that.options.resources && that.options.resources.template) {
            rendererFnOptions.templateSource = function () { // TODO: don't obliterate, multitemplates, etc.
                return that.options.resources.template.resourceText;
            };
        }
        var produceTree = that.events.produceTree;
        produceTree.addListener(function() {
            return that.options.protoTree;
        });
        
        if (that.options.produceTree) {
            produceTree.addListener(that.options.produceTree);
        }

        fluid.renderer.reverseMerge(rendererFnOptions, that.options, ["resolverGetConfig", "resolverSetConfig"]);
        if (rendererFnOptions.rendererTargetSelector) {
            container = function () {return that.dom.locate(rendererFnOptions.rendererTargetSelector); };
        }
       
        var renderer = {
            fossils: {},
            boundPathForNode: function (node) {
                return fluid.boundPathForNode(node, renderer.fossils);
            }
        };
       
        var rendererSub = fluid.renderer.createRendererSubcomponent(container, that.options.selectors, rendererFnOptions, that, renderer.fossils);
        that.renderer = $.extend(renderer, rendererSub);
        
        if (messageResolver) {
            that.messageResolver = messageResolver;
        }

        that.refreshView = renderer.refreshView = function () {
            if (rendererOptions.parentComponent) {
                fluid.renderer.clearDecorators(rendererOptions.parentComponent);
            }
            that.events.prepareModelForRender.fire(that.model, that.applier, that);
            var tree = produceTree.fire(that);
            if (that.renderer.expander) {
                tree = that.renderer.expander(tree);
            }
            that.events.onRenderTree.fire(that, tree);
            that.renderer.render(tree);
            that.events.afterRender.fire(that);
        };
        
        if (that.options.renderOnInit) {
            that.refreshView();
        }
        
        return that;
    };
    
    var removeSelectors = function (selectors, selectorsToIgnore) {
        fluid.each(fluid.makeArray(selectorsToIgnore), function (selectorToIgnore) {
            delete selectors[selectorToIgnore];
        });
        return selectors;
    };

    var markRepeated = function (selectorKey, repeatingSelectors) {
        if (repeatingSelectors) {
            fluid.each(repeatingSelectors, function (repeatingSelector) {
                if (selectorKey === repeatingSelector) {
                    selectorKey = selectorKey + ":";
                }
            });
        }
        return selectorKey;
    };

    fluid.renderer.selectorsToCutpoints = function (selectors, options) {
        var togo = [];
        options = options || {};
        selectors = fluid.copy(selectors); // Make a copy before potentially destructively changing someone's selectors.
    
        if (options.selectorsToIgnore) {
            selectors = removeSelectors(selectors, options.selectorsToIgnore);
        }
    
        for (var selectorKey in selectors) {
            togo.push({
                id: markRepeated(selectorKey, options.repeatingSelectors),
                selector: selectors[selectorKey]
            });
        }
    
        return togo;
    };
  
    /** END of "Renderer Components" infrastructure **/
    
    fluid.renderer.NO_COMPONENT = {};
  
    /** A special "shallow copy" operation suitable for nondestructively
     * merging trees of components. jQuery.extend in shallow mode will 
     * neglect null valued properties.
     * This function is unsupported: It is not really intended for use by implementors.
     */
    fluid.renderer.mergeComponents = function (target, source) {
        for (var key in source) {
            target[key] = source[key];
        }
        return target;
    };
    
    fluid.registerNamespace("fluid.renderer.selection");
        
    /** Definition of expanders - firstly, "heavy" expanders **/
    
    fluid.renderer.selection.inputs = function (options, container, key, config) {
        fluid.expect("Selection to inputs expander", ["selectID", "inputID", "labelID", "rowID"], options);
        var selection = config.expander(options.tree);
        var rows = fluid.transform(selection.optionlist.value, function (option, index) {
            var togo = {};
            var element =  {parentRelativeID: "..::" + options.selectID, choiceindex: index};
            togo[options.inputID] = element;
            togo[options.labelID] = fluid.copy(element); 
            return togo;
        });
        var togo = {}; // TODO: JICO needs to support "quoted literal key initialisers" :P
        togo[options.selectID] = selection;
        togo[options.rowID] = {children: rows};
        togo = config.expander(togo);
        return togo;
    };
    
    fluid.renderer.repeat = function (options, container, key, config) {
        fluid.expect("Repetition expander", ["controlledBy", "tree"], options);
        var env = config.threadLocal();
        var path = fluid.extractContextualPath(options.controlledBy, {ELstyle: "ALL"}, env);
        var list = fluid.get(config.model, path, config.resolverGetConfig);
        
        var togo = {};
        if (!list || list.length === 0) {
            return options.ifEmpty ? config.expander(options.ifEmpty) : togo;
        }
        var expanded = [];
        fluid.each(list, function (element, i) {
            var EL = fluid.model.composePath(path, i);
            var envAdd = {}; 
            if (options.pathAs) {
                envAdd[options.pathAs] = "${" + EL + "}";
            }
            if (options.valueAs) {
                envAdd[options.valueAs] = fluid.get(config.model, EL, config.resolverGetConfig);
            }
            var expandrow = fluid.withEnvironment(envAdd, function() {
                return config.expander(options.tree);
            }, env);
            if (fluid.isArrayable(expandrow)) {
                if (expandrow.length > 0) {
                    expanded.push({children: expandrow});
                }
            }
            else if (expandrow !== fluid.renderer.NO_COMPONENT) {
                expanded.push(expandrow);
            }
        });
        var repeatID = options.repeatID;
        if (repeatID.indexOf(":") === -1) {
            repeatID = repeatID + ":";
        }
        fluid.each(expanded, function (entry) {entry.ID = repeatID; });
        return expanded;
    };
    
    fluid.renderer.condition = function (options, container, key, config) {
        fluid.expect("Selection to condition expander", ["condition"], options);
        var condition;
        if (options.condition.funcName) {
            var args = config.expandLight(options.condition.args);
            condition = fluid.invoke(options.condition.funcName, args);
        } else if (options.condition.expander) {
            condition = config.expander(options.condition);
        } else {
            condition = config.expandLight(options.condition);
        }
        var tree = (condition ? options.trueTree : options.falseTree);
        if (!tree) {
            tree = fluid.renderer.NO_COMPONENT;
        }
        return config.expander(tree);
    };
    
    
    /* An EL extraction utility suitable for context expressions which occur in 
     * expanding component trees. It assumes that any context expressions refer
     * to EL paths that are to be referred to the "true (direct) model" - since
     * the context during expansion may not agree with the context during rendering.
     * It satisfies the same contract as fluid.extractEL, in that it will either return
     * an EL path, or undefined if the string value supplied cannot be interpreted
     * as an EL path with respect to the supplied options.
     */
    // unsupported, non-API function
    fluid.extractContextualPath = function (string, options, env) {
        var parsed = fluid.extractELWithContext(string, options);
        if (parsed) {
            if (parsed.context) {
                return fluid.transformContextPath(parsed, env).path;
            }
            else {
                return parsed.path;
            }
        }
    };
    
    fluid.transformContextPath = function (parsed, env) {
        if (parsed.context) {
            var fetched = env[parsed.context];
            var EL;
            if (typeof(fetched) === "string") {
                EL = fluid.extractEL(fetched, {ELstyle: "${}"});
            }
            if (EL) {
                return {
                    noDereference: parsed.path === "", 
                    path: fluid.model.composePath(EL, parsed.path) 
                }; 
            }
        }
        return parsed;
    };
    
    // A forgiving variation of "makeStackFetcher" that returns nothing on failing to resolve an IoC reference, 
    // in keeping with current protoComponent semantics. Note to self: abolish protoComponents
    fluid.renderer.makeExternalFetcher = function (contextThat) {
        return function (parsed) {
            var foundComponent = fluid.resolveContext(parsed.context, contextThat);
            return foundComponent ? fluid.getForComponent(foundComponent, parsed.path) : undefined;
        };
    };

    /** Create a "protoComponent expander" with the supplied set of options.
     * The returned value will be a function which accepts a "protoComponent tree"
     * as argument, and returns a "fully expanded" tree suitable for supplying
     * directly to the renderer.
     * A "protoComponent tree" is similar to the "dehydrated form" accepted by
     * the historical renderer - only
     * i) The input format is unambiguous - this expander will NOT accept hydrated
     * components in the {ID: "myId, myfield: "myvalue"} form - but ONLY in
     * the dehydrated {myID: {myfield: myvalue}} form.
     * ii) This expander has considerably greater power to expand condensed trees.
     * In particular, an "EL style" option can be supplied which will expand bare
     * strings found as values in the tree into UIBound components by a configurable
     * strategy. Supported values for "ELstyle" are a) "ALL" - every string will be
     * interpreted as an EL reference and assigned to the "valuebinding" member of
     * the UIBound, or b) any single character, which if it appears as the first
     * character of the string, will mark it out as an EL reference - otherwise it
     * will be considered a literal value, or c) the value "${}" which will be
     * recognised bracketing any other EL expression.
     */

    fluid.renderer.makeProtoExpander = function (expandOptions, parentThat) {
      // shallow copy of options - cheaply avoid destroying model, and all others are primitive
        var options = $.extend({
            ELstyle: "${}"
        }, expandOptions); // shallow copy of options
        if (parentThat) {
            options.externalFetcher = fluid.renderer.makeExternalFetcher(parentThat);
        }
        var threadLocal; // rebound on every expansion at entry point
        
        function fetchEL(string) {
            var env = threadLocal();
            return fluid.extractContextualPath(string, options, env, options.externalFetcher);
        }
         
        var IDescape = options.IDescape || "\\";
        
        var expandLight = function (source) {
            return fluid.expand(source, options); 
        };

        var expandBound = function (value, concrete) {
            if (value.messagekey !== undefined) {
                return {
                    componentType: "UIMessage",
                    messagekey: expandBound(value.messagekey),
                    args: expandLight(value.args)
                };
            }
            var proto;
            if (!fluid.isPrimitive(value) && !fluid.isArrayable(value)) {
                proto = $.extend({}, value);
                if (proto.decorators) {
                    proto.decorators = expandLight(proto.decorators);
                }
                value = proto.value;
                delete proto.value;
            } else {
                proto = {};
            }
            var EL = typeof (value) === "string" ? fetchEL(value) : null;
            if (EL) {
                proto.valuebinding = EL;
            } else if (value !== undefined) {
                proto.value = value;
            }
            if (options.model && proto.valuebinding && proto.value === undefined) {
                proto.value = fluid.get(options.model, proto.valuebinding, options.resolverGetConfig);
            }
            if (concrete) {
                proto.componentType = "UIBound";
            }
            return proto;
        };
        
        options.filter = fluid.expander.lightFilter;
        
        var expandCond;
        var expandLeafOrCond;
        
        var expandEntry = function (entry) {
            var comp = [];
            expandCond(entry, comp);
            return {children: comp};
        };
        
        var expandExternal = function (entry) {
            if (entry === fluid.renderer.NO_COMPONENT) {
                return entry;
            }
            var singleTarget;
            var target = [];
            var pusher = function (comp) {
                singleTarget = comp;
            };
            expandLeafOrCond(entry, target, pusher);
            return singleTarget || target;
        };
        
        var expandConfig = {
            model: options.model,
            resolverGetConfig: options.resolverGetConfig,
            resolverSetConfig: options.resolverSetConfig,
            expander: expandExternal,
            expandLight: expandLight
            //threadLocal: threadLocal
        };
        
        var expandLeaf = function (leaf, componentType) {
            var togo = {componentType: componentType};
            var map = fluid.renderer.boundMap[componentType] || {};
            for (var key in leaf) {
                if (/decorators|args/.test(key)) {
                    togo[key] = expandLight(leaf[key]);
                    continue;
                } else if (map[key]) {
                    togo[key] = expandBound(leaf[key]);
                } else {
                    togo[key] = leaf[key];
                }
            }
            return togo;
        };
        
        // A child entry may be a cond, a leaf, or another "thing with children".
        // Unlike the case with a cond's contents, these must be homogeneous - at least
        // they may either be ALL leaves, or else ALL cond/childed etc. 
        // In all of these cases, the key will be THE PARENT'S KEY
        var expandChildren = function (entry, pusher) {
            var children = entry.children;
            for (var i = 0; i < children.length; ++i) {
                // each child in this list will lead to a WHOLE FORKED set of children.
                var target = [];
                var comp = { children: target};
                var child = children[i];
                var childPusher = function (comp) {
                    target[target.length] = comp;
                }; // jslint:ok - function in loop 
                expandLeafOrCond(child, target, childPusher);
                // Rescue the case of an expanded leaf into single component - TODO: check what sense this makes of the grammar
                if (comp.children.length === 1 && !comp.children[0].ID) {
                    comp = comp.children[0];
                }
                pusher(comp); 
            }
        };
        
        function detectBareBound(entry) {
            return fluid.find(entry, function (value, key) {
                return key === "decorators";
            }) !== false;
        }
        
        // We have reached something which is either a leaf or Cond - either inside
        // a Cond or as an entry in children.
        var expandLeafOrCond = function (entry, target, pusher) { // jslint:ok - forward declaration
            var componentType = fluid.renderer.inferComponentType(entry);
            if (!componentType && (fluid.isPrimitive(entry) || detectBareBound(entry))) {
                componentType = "UIBound";
            }
            if (componentType) {
                pusher(componentType === "UIBound" ? expandBound(entry, true) : expandLeaf(entry, componentType));
            } else {
              // we couldn't recognise it as a leaf, so it must be a cond
              // this may be illegal if we are already in a cond.
                if (!target) {
                    fluid.fail("Illegal cond->cond transition");
                }
                expandCond(entry, target);
            }
        };
        
        // cond entry may be a leaf, "thing with children" or a "direct bound".
        // a Cond can ONLY occur as a direct member of "children". Each "cond" entry may
        // give rise to one or many elements with the SAME key - if "expandSingle" discovers
        // "thing with children" they will all share the same key found in proto. 
        expandCond = function (proto, target) {
            for (var key in proto) {
                var entry = proto[key];
                if (key.charAt(0) === IDescape) {
                    key = key.substring(1);
                }
                if (key === "expander") {
                    var expanders = fluid.makeArray(entry);
                    fluid.each(expanders, function (expander) {
                        var expanded = fluid.invokeGlobalFunction(expander.type, [expander, proto, key, expandConfig]);
                        if (expanded !== fluid.renderer.NO_COMPONENT) {
                            fluid.each(expanded, function (el) {target[target.length] = el; });
                        }
                    }); // jslint:ok - function in loop
                } else if (entry) {
                    var condPusher = function (comp) {
                        comp.ID = key;
                        target[target.length] = comp; 
                    }; // jslint:ok - function in loop

                    if (entry.children) {
                        if (key.indexOf(":") === -1) {
                            key = key + ":";
                        }
                        expandChildren(entry, condPusher);
                    } else if (fluid.renderer.isBoundPrimitive(entry)) {
                        condPusher(expandBound(entry, true));
                    } else {
                        expandLeafOrCond(entry, null, condPusher);
                    }
                }
            }
                
        };
        
        return function(entry) {
            threadLocal = fluid.threadLocal(function() {
                return $.extend({}, options.envAdd);
            });
            options.fetcher = fluid.makeEnvironmentFetcher(options.model, fluid.transformContextPath, threadLocal, options.externalFetcher);
            expandConfig.threadLocal = threadLocal;
            return expandEntry(entry);
        };
    };
    
})(jQuery, fluid_1_5);
    /*
Copyright 2011 OCAD University
Copyright 2011 Lucendo Development Ltd.

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global fluid_1_5:true, jQuery, window */

// JSLint options 
/*jslint white: true, funcinvoke: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

var fluid_1_5 = fluid_1_5 || {};

(function ($, fluid) {
    
    /******
    * ToC *
    *******/
    fluid.registerNamespace("fluid.tableOfContents");


    
    fluid.tableOfContents.insertAnchor = function (name, element) {
       // In order to resolve FLUID-4453, we need to make sure that the owner document is correctly
       // taken from the target element (the preview may be in an iframe)
        var anchor = $("<a></a>", element.ownerDocument);
        anchor.prop({
            name: name,
            id: name
        });
        anchor.insertBefore(element);
    };
    
    fluid.tableOfContents.generateGUID = function () {
        return fluid.allocateSimpleId();
    };
       
    /**
     * Invoker function to filter headings.  Default is to filter out the visible headings.
     * @param   Object  Contains a list of headings, usually generated by that.locate("headings")
     * @return  filtered headings
     */
    fluid.tableOfContents.filterHeadings = function (headings) {
        return headings.filter(":visible");
    };
    
    fluid.tableOfContents.finalInit = function (that) {
        var headings = that.filterHeadings(that.locate("headings"));
        
        that.headingTextToAnchor = function (heading) {
            var guid = that.generateGUID();
            
            var anchorInfo = {
                id: guid,
                url: "#" + guid
            };
            
            that.insertAnchor(anchorInfo.id, heading);
            return anchorInfo;
        };
        
        that.anchorInfo = fluid.transform(headings, function (heading) {
            return that.headingTextToAnchor(heading);
        });
        
        // TODO: is it weird to have hide and show on a component?
        that.hide = function () {
            that.locate("tocContainer").hide();
        };
        
        that.show = function () {
            that.locate("tocContainer").show();
        };
        
        var headingsModel = that.modelBuilder.assembleModel(headings, that.anchorInfo);
        
        that.applier.requestChange("", headingsModel);

        that.events.onReady.fire();
    };
    
    
    fluid.defaults("fluid.tableOfContents", {
        gradeNames: ["fluid.viewComponent", "autoInit"],
        finalInitFunction: "fluid.tableOfContents.finalInit",
        components: {
            levels: {
                type: "fluid.tableOfContents.levels",
                container: "{tableOfContents}.dom.tocContainer",
                createOnEvent: "onReady",
                options: {
                    model: {
                        headings: "{tableOfContents}.model"
                    }, 
                    events: {
                        afterRender: "{tableOfContents}.events.afterRender"
                    }
                }
            },
            modelBuilder: {
                type: "fluid.tableOfContents.modelBuilder"
            }
        },
        model: [],
        invokers: {
            insertAnchor: "fluid.tableOfContents.insertAnchor",
            generateGUID: "fluid.tableOfContents.generateGUID",
            filterHeadings: "fluid.tableOfContents.filterHeadings"
        },
        selectors: {
            headings: ":header",
            tocContainer: ".flc-toc-tocContainer"
        },
        events: {
            onReady: null,
            afterRender: null
        }
    });
    
    
    /*******************
    * ToC ModelBuilder *
    ********************/
    fluid.registerNamespace("fluid.tableOfContents.modelBuilder");
    
    fluid.tableOfContents.modelBuilder.toModel = function (headingInfo, modelLevelFn) {
        var headings = fluid.copy(headingInfo);
        var buildModelLevel = function (headings, level) {
            var modelLevel = [];
            while (headings.length > 0) {
                var heading = headings[0];
                if (heading.level < level) {
                    break;
                }
                if (heading.level > level) {
                    var subHeadings = buildModelLevel(headings, level + 1);
                    if (modelLevel.length > 0) {
                        modelLevel[modelLevel.length - 1].headings = subHeadings;
                    } else {
                        modelLevel = modelLevelFn(modelLevel, subHeadings);
                    }
                }
                if (heading.level === level) {
                    modelLevel.push(heading); 
                    headings.shift();
                }
            }
            return modelLevel;
        };
        return buildModelLevel(headings, 1);
    };
       
    fluid.tableOfContents.modelBuilder.gradualModelLevelFn = function (modelLevel, subHeadings) {
        // Clone the subHeadings because we don't want to modify the reference of the subHeadings.  
        // the reference will affect the equality condition in generateTree(), resulting an unwanted tree.
        var subHeadingsClone = fluid.copy(subHeadings);
        subHeadingsClone[0].level--;
        return subHeadingsClone;
    };

    fluid.tableOfContents.modelBuilder.skippedModelLevelFn = function (modelLevel, subHeadings) {
        modelLevel.push({headings: subHeadings});
        return modelLevel;
    };
    
    fluid.tableOfContents.modelBuilder.finalInit = function (that) {
        
        that.convertToHeadingObjects = function (headings, anchorInfo) {
            headings = $(headings);
            return fluid.transform(headings, function (heading, index) {
                return {
                    level: that.headingCalculator.getHeadingLevel(heading),
                    text: $(heading).text(),
                    url: anchorInfo[index].url
                };
            });
        };
        
        that.assembleModel = function (headings, anchorInfo) {
            var headingInfo = that.convertToHeadingObjects(headings, anchorInfo);
            return that.toModel(headingInfo);
        };
    };
    
    fluid.defaults("fluid.tableOfContents.modelBuilder", {
        gradeNames: ["fluid.littleComponent", "autoInit"],
        finalInitFunction: "fluid.tableOfContents.modelBuilder.finalInit",
        components: {
            headingCalculator: {
                type: "fluid.tableOfContents.modelBuilder.headingCalculator"
            }
        },
        invokers: {
            toModel: {
                funcName: "fluid.tableOfContents.modelBuilder.toModel",
                args: ["{arguments}.0", "{modelBuilder}.modelLevelFn"]
            },
            modelLevelFn: "fluid.tableOfContents.modelBuilder.gradualModelLevelFn"
        }
    });
    
    /*************************************
    * ToC ModelBuilder headingCalculator *
    **************************************/
    fluid.registerNamespace("fluid.tableOfContents.modelBuilder.headingCalculator");
    
    fluid.tableOfContents.modelBuilder.headingCalculator.finalInit = function (that) {
        that.getHeadingLevel = function (heading) {
            return $.inArray(heading.tagName, that.options.levels) + 1;
        };
    };
    
    fluid.defaults("fluid.tableOfContents.modelBuilder.headingCalculator", {
        gradeNames: ["fluid.littleComponent", "autoInit"],
        finalInitFunction: "fluid.tableOfContents.modelBuilder.headingCalculator.finalInit",
        levels: ["H1", "H2", "H3", "H4", "H5", "H6"]
    });
    
    /*************
    * ToC Levels *
    **************/
    fluid.registerNamespace("fluid.tableOfContents.levels");
    
    fluid.tableOfContents.levels.finalInit = function (that) {
        fluid.fetchResources(that.options.resources, function () {
            that.container.append(that.options.resources.template.resourceText);
            that.refreshView();
        });        
    };

    /**
     * Create an object model based on the type and ID.  The object should contain an
     * ID that maps the selectors (ie. level1:), and the object should contain a children
     * @param   string      Accepted values are: level, items
     * @param   int         The current level which is used here as the ID.
     */
    fluid.tableOfContents.levels.objModel = function (type, ID) {
        var objModel = {
            ID: type + ID + ":",
            children: []
        };
        return objModel;
    };
    
    /** 
     * Configure item object when item object has no text, uri, level in it.
     * defaults to add a decorator to hide the bullets.
     */
    fluid.tableOfContents.levels.handleEmptyItemObj = function (itemObj) {
        itemObj.decorators = [{
            type: "addClass",
            classes: "fl-tableOfContents-hide-bullet"
        }];
    };
    
    /**
     * @param   Object  that.model, the model with all the headings, it should be in the format of {headings: [...]}
     * @param   int     the current level we want to generate the tree for.  default to 1 if not defined.
     * @return  Object  A tree that looks like {children: [{ID: x, subTree:[...]}, ...]}
     */
    fluid.tableOfContents.levels.generateTree = function (headingsModel, currentLevel) {
        currentLevel = currentLevel || 0;
        var levelObj = fluid.tableOfContents.levels.objModel("level", currentLevel);
        
        // FLUID-4352, run generateTree iff there are headings in the model.
        if (headingsModel.headings.length === 0) {
            return [];
        }
        
        // base case: level is 0, returns {children:[generateTree(nextLevel)]}
        // purpose is to wrap the first level with a children object.
        if (currentLevel === 0) {
            var tree = {
                children: [
                    fluid.tableOfContents.levels.generateTree(headingsModel, currentLevel + 1)
                ]
            };
            return tree;
        }
        
        // Loop through the heading array, which can have multiple headings on the same level
        $.each(headingsModel.headings, function (index, model) {
            var itemObj = fluid.tableOfContents.levels.objModel("items", currentLevel);
            var linkObj = {
                ID: "link" + currentLevel,
                target: model.url,
                linktext: model.text
            };
            
            // If level is undefined, then add decorator to it, otherwise add the links to it.
            if (!model.level) {
                fluid.tableOfContents.levels.handleEmptyItemObj(itemObj);
            } else {
                itemObj.children.push(linkObj);
            }
            // If there are sub-headings, go into the next level recursively
            if (model.headings) {
                itemObj.children.push(fluid.tableOfContents.levels.generateTree(model, currentLevel + 1));
            }
            // At this point, the itemObj should be in a tree format with sub-headings children
            levelObj.children.push(itemObj);
        });
        return levelObj;
    };
    
    /** 
     * @return  Object  Returned produceTree must be in {headings: [trees]}
     */
    fluid.tableOfContents.levels.produceTree = function (that) {
        return fluid.tableOfContents.levels.generateTree(that.model);
    };
     
    fluid.defaults("fluid.tableOfContents.levels", {
        gradeNames: ["fluid.rendererComponent", "autoInit"],
        finalInitFunction: "fluid.tableOfContents.levels.finalInit",
        produceTree: "fluid.tableOfContents.levels.produceTree",
        selectors: {
            level1: ".flc-toc-levels-level1",
            level2: ".flc-toc-levels-level2",
            level3: ".flc-toc-levels-level3",
            level4: ".flc-toc-levels-level4",
            level5: ".flc-toc-levels-level5",
            level6: ".flc-toc-levels-level6",
            items1: ".flc-toc-levels-items1",
            items2: ".flc-toc-levels-items2",
            items3: ".flc-toc-levels-items3",
            items4: ".flc-toc-levels-items4",
            items5: ".flc-toc-levels-items5",
            items6: ".flc-toc-levels-items6",
            link1: ".flc-toc-levels-link1",
            link2: ".flc-toc-levels-link2",
            link3: ".flc-toc-levels-link3",
            link4: ".flc-toc-levels-link4",
            link5: ".flc-toc-levels-link5",
            link6: ".flc-toc-levels-link6"            
        },
        repeatingSelectors: ["level1", "level2", "level3", "level4", "level5", "level6", "items1", "items2", "items3", "items4", "items5", "items6"],
        model: {
            headings: [] // [text: heading, url: linkURL, headings: [ an array of subheadings in the same format]
        },
        resources: {
            template: {
                forceCache: true,
                url: "../html/TableOfContents.html"
            }
        }, 
        rendererFnOptions: {
            noexpand: true
        },
        rendererOptions: {
            debugMode: false
        }

    });

})(jQuery, fluid_1_5);
/*
    json2.js
    2007-11-06

    Public Domain

    No warranty expressed or implied. Use at your own risk.

    See http://www.JSON.org/js.html

    This file creates a global JSON object containing two methods:

        JSON.stringify(value, whitelist)
            value       any JavaScript value, usually an object or array.

            whitelist   an optional that determines how object values are
                        stringified.

            This method produces a JSON text from a JavaScript value.
            There are three possible ways to stringify an object, depending
            on the optional whitelist parameter.

            If an object has a toJSON method, then the toJSON() method will be
            called. The value returned from the toJSON method will be
            stringified.

            Otherwise, if the optional whitelist parameter is an array, then
            the elements of the array will be used to select members of the
            object for stringification.

            Otherwise, if there is no whitelist parameter, then all of the
            members of the object will be stringified.

            Values that do not have JSON representaions, such as undefined or
            functions, will not be serialized. Such values in objects will be
            dropped, in arrays will be replaced with null. JSON.stringify()
            returns undefined. Dates will be stringified as quoted ISO dates.

            Example:

            var text = JSON.stringify(['e', {pluribus: 'unum'}]);
            // text is '["e",{"pluribus":"unum"}]'

        JSON.parse(text, filter)
            This method parses a JSON text to produce an object or
            array. It can throw a SyntaxError exception.

            The optional filter parameter is a function that can filter and
            transform the results. It receives each of the keys and values, and
            its return value is used instead of the original value. If it
            returns what it received, then structure is not modified. If it
            returns undefined then the member is deleted.

            Example:

            // Parse the text. If a key contains the string 'date' then
            // convert the value to a date.

            myData = JSON.parse(text, function (key, value) {
                return key.indexOf('date') >= 0 ? new Date(value) : value;
            });

    This is a reference implementation. You are free to copy, modify, or
    redistribute.

    Use your own copy. It is extremely unwise to load third party
    code into your pages.
*/

/*jslint evil: true */
/*extern JSON */

if (!this.JSON) {

    JSON = function () {

        function f(n) {    // Format integers to have at least two digits.
            return n < 10 ? '0' + n : n;
        }

        Date.prototype.toJSON = function () {

// Eventually, this method will be based on the date.toISOString method.

            return this.getUTCFullYear()   + '-' +
                 f(this.getUTCMonth() + 1) + '-' +
                 f(this.getUTCDate())      + 'T' +
                 f(this.getUTCHours())     + ':' +
                 f(this.getUTCMinutes())   + ':' +
                 f(this.getUTCSeconds())   + 'Z';
        };


        var m = {    // table of character substitutions
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
        };

        function stringify(value, whitelist) {
            var a,          // The array holding the partial texts.
                i,          // The loop counter.
                k,          // The member key.
                l,          // Length.
                r = /["\\\x00-\x1f\x7f-\x9f]/g,
                v;          // The member value.

            switch (typeof value) {
            case 'string':

// If the string contains no control characters, no quote characters, and no
// backslash characters, then we can safely slap some quotes around it.
// Otherwise we must also replace the offending characters with safe sequences.

                return r.test(value) ?
                    '"' + value.replace(r, function (a) {
                        var c = m[a];
                        if (c) {
                            return c;
                        }
                        c = a.charCodeAt();
                        return '\\u00' + Math.floor(c / 16).toString(16) +
                                                   (c % 16).toString(16);
                    }) + '"' :
                    '"' + value + '"';

            case 'number':

// JSON numbers must be finite. Encode non-finite numbers as null.

                return isFinite(value) ? String(value) : 'null';

            case 'boolean':
            case 'null':
                return String(value);

            case 'object':

// Due to a specification blunder in ECMAScript,
// typeof null is 'object', so watch out for that case.

                if (!value) {
                    return 'null';
                }

// If the object has a toJSON method, call it, and stringify the result.

                if (typeof value.toJSON === 'function') {
                    return stringify(value.toJSON());
                }
                a = [];
                if (typeof value.length === 'number' &&
                        !(value.propertyIsEnumerable('length'))) {

// The object is an array. Stringify every element. Use null as a placeholder
// for non-JSON values.

                    l = value.length;
                    for (i = 0; i < l; i += 1) {
                        a.push(stringify(value[i], whitelist) || 'null');
                    }

// Join all of the elements together and wrap them in brackets.

                    return '[' + a.join(',') + ']';
                }
                if (whitelist) {

// If a whitelist (array of keys) is provided, use it to select the components
// of the object.

                    l = whitelist.length;
                    for (i = 0; i < l; i += 1) {
                        k = whitelist[i];
                        if (typeof k === 'string') {
                            v = stringify(value[k], whitelist);
                            if (v) {
                                a.push(stringify(k) + ':' + v);
                            }
                        }
                    }
                } else {

// Otherwise, iterate through all of the keys in the object.

                    for (k in value) {
                        if (typeof k === 'string') {
                            v = stringify(value[k], whitelist);
                            if (v) {
                                a.push(stringify(k) + ':' + v);
                            }
                        }
                    }
                }

// Join all of the member texts together and wrap them in braces.

                return '{' + a.join(',') + '}';
            }
        }

        return {
            stringify: stringify,
            parse: function (text, filter) {
                var j;

                function walk(k, v) {
                    var i, n;
                    if (v && typeof v === 'object') {
                        for (i in v) {
                            if (Object.prototype.hasOwnProperty.apply(v, [i])) {
                                n = walk(i, v[i]);
                                if (n !== undefined) {
                                    v[i] = n;
                                }
                            }
                        }
                    }
                    return filter(k, v);
                }


// Parsing happens in three stages. In the first stage, we run the text against
// regular expressions that look for non-JSON patterns. We are especially
// concerned with '()' and 'new' because they can cause invocation, and '='
// because it can cause mutation. But just to be safe, we want to reject all
// unexpected forms.

// We split the first stage into 4 regexp operations in order to work around
// crippling inefficiencies in IE's and Safari's regexp engines. First we
// replace all backslash pairs with '@' (a non-JSON character). Second, we
// replace all simple value tokens with ']' characters. Third, we delete all
// open brackets that follow a colon or comma or that begin the text. Finally,
// we look to see that the remaining characters are only whitespace or ']' or
// ',' or ':' or '{' or '}'. If that is so, then the text is safe for eval.

                if (/^[\],:{}\s]*$/.test(text.replace(/\\./g, '@').
replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(:?[eE][+\-]?\d+)?/g, ']').
replace(/(?:^|:|,)(?:\s*\[)+/g, ''))) {

// In the second stage we use the eval function to compile the text into a
// JavaScript structure. The '{' operator is subject to a syntactic ambiguity
// in JavaScript: it can begin a block or an object literal. We wrap the text
// in parens to eliminate the ambiguity.

                    j = eval('(' + text + ')');

// In the optional third stage, we recursively walk the new structure, passing
// each name/value pair to a filter function for possible transformation.

                    return typeof filter === 'function' ? walk('', j) : j;
                }

// If the text is not JSON parseable, then a SyntaxError is thrown.

                throw new SyntaxError('parseJSON');
            }
        };
    }();
}
/*!
 * jQuery UI Touch Punch 0.2.2
 *
 * Copyright 2011, Dave Furfero
 * Dual licensed under the MIT or GPL Version 2 licenses.
 *
 * Depends:
 *  jquery.ui.widget.js
 *  jquery.ui.mouse.js
 */
(function ($) {

  // Detect touch support
  $.support.touch = 'ontouchend' in document;

  // Ignore browsers without touch support
  if (!$.support.touch) {
    return;
  }

  var mouseProto = $.ui.mouse.prototype,
      _mouseInit = mouseProto._mouseInit,
      touchHandled;

  /**
   * Simulate a mouse event based on a corresponding touch event
   * @param {Object} event A touch event
   * @param {String} simulatedType The corresponding mouse event
   */
  function simulateMouseEvent (event, simulatedType) {

    // Ignore multi-touch events
    if (event.originalEvent.touches.length > 1) {
      return;
    }

    event.preventDefault();

    var touch = event.originalEvent.changedTouches[0],
        simulatedEvent = document.createEvent('MouseEvents');
    
    // Initialize the simulated mouse event using the touch event's coordinates
    simulatedEvent.initMouseEvent(
      simulatedType,    // type
      true,             // bubbles                    
      true,             // cancelable                 
      window,           // view                       
      1,                // detail                     
      touch.screenX,    // screenX                    
      touch.screenY,    // screenY                    
      touch.clientX,    // clientX                    
      touch.clientY,    // clientY                    
      false,            // ctrlKey                    
      false,            // altKey                     
      false,            // shiftKey                   
      false,            // metaKey                    
      0,                // button                     
      null              // relatedTarget              
    );

    // Dispatch the simulated event to the target element
    event.target.dispatchEvent(simulatedEvent);
  }

  /**
   * Handle the jQuery UI widget's touchstart events
   * @param {Object} event The widget element's touchstart event
   */
  mouseProto._touchStart = function (event) {

    var self = this;

    // Ignore the event if another widget is already being handled
    if (touchHandled || !self._mouseCapture(event.originalEvent.changedTouches[0])) {
      return;
    }

    // Set the flag to prevent other widgets from inheriting the touch event
    touchHandled = true;

    // Track movement to determine if interaction was a click
    self._touchMoved = false;

    // Simulate the mouseover event
    simulateMouseEvent(event, 'mouseover');

    // Simulate the mousemove event
    simulateMouseEvent(event, 'mousemove');

    // Simulate the mousedown event
    simulateMouseEvent(event, 'mousedown');
  };

  /**
   * Handle the jQuery UI widget's touchmove events
   * @param {Object} event The document's touchmove event
   */
  mouseProto._touchMove = function (event) {

    // Ignore event if not handled
    if (!touchHandled) {
      return;
    }

    // Interaction was not a click
    this._touchMoved = true;

    // Simulate the mousemove event
    simulateMouseEvent(event, 'mousemove');
  };

  /**
   * Handle the jQuery UI widget's touchend events
   * @param {Object} event The document's touchend event
   */
  mouseProto._touchEnd = function (event) {

    // Ignore event if not handled
    if (!touchHandled) {
      return;
    }

    // Simulate the mouseup event
    simulateMouseEvent(event, 'mouseup');

    // Simulate the mouseout event
    simulateMouseEvent(event, 'mouseout');

    // If the touch interaction did not move, it should trigger a click
    if (!this._touchMoved) {

      // Simulate the click event
      simulateMouseEvent(event, 'click');
    }

    // Unset the flag to allow other widgets to inherit the touch event
    touchHandled = false;
  };

  /**
   * A duck punch of the $.ui.mouse _mouseInit method to support touch events.
   * This method extends the widget with bound touch event handlers that
   * translate touch events to mouse events and pass them to the widget's
   * original mouse event handling methods.
   */
  mouseProto._mouseInit = function () {
    
    var self = this;

    // Delegate the touch handlers to the widget's element
    self.element
      .bind('touchstart', $.proxy(self, '_touchStart'))
      .bind('touchmove', $.proxy(self, '_touchMove'))
      .bind('touchend', $.proxy(self, '_touchEnd'));

    // Call the original $.ui.mouse init method
    _mouseInit.call(self);
  };

})(jQuery);/*
Copyright 2009-2010 University of Cambridge
Copyright 2011 Lucendo Development Ltd.

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global fluid_1_5:true, jQuery*/

// JSLint options 
/*jslint white: true, funcinvoke: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

var fluid_1_5 = fluid_1_5 || {};

(function ($, fluid) {

    /** URL utilities salvaged from kettle - these should go into core framework **/

    fluid.registerNamespace("fluid.url");
   
    fluid.url.generateDepth = function(depth) {
        return fluid.generate(depth, "../").join("");
    };
   
    fluid.url.parsePathInfo = function (pathInfo) {
        var togo = {};
        var segs = pathInfo.split("/");
        if (segs.length > 0) {
            var top = segs.length - 1;
            var dotpos = segs[top].indexOf(".");
            if (dotpos !== -1) {
                togo.extension = segs[top].substring(dotpos + 1);
                segs[top] = segs[top].substring(0, dotpos);
            }
        }
        togo.pathInfo = segs;
        return togo;
    };
    
    fluid.url.parsePathInfoTrim = function (pathInfo) {
        var togo = fluid.url.parsePathInfo(pathInfo);
        if (togo.pathInfo[togo.pathInfo.length - 1] === "") {
            togo.pathInfo.length--;
        }
        return togo;
    };
    
    /** Collapse the array of segments into a URL path, starting at the specified
     * segment index - this will not terminate with a slash, unless the final segment
     * is the empty string
     */
    fluid.url.collapseSegs = function(segs, from, to) {
        var togo = "";
        if (from === undefined) { 
            from = 0;
        }
        if (to === undefined) {
            to = segs.length;
        }
        for (var i = from; i < to - 1; ++ i) {
            togo += segs[i] + "/";
        }
        if (to > from) { // TODO: bug in Kettle version
            togo += segs[to - 1];
        }
        return togo;   
    };
    
    fluid.url.makeRelPath = function(parsed, index) {
        var togo = fluid.kettle.collapseSegs(parsed.pathInfo, index);
        if (parsed.extension) {
            togo += "." + parsed.extension;
        }
        return togo;
    };
    
    /** Canonicalise IN PLACE the supplied segment array derived from parsing a
     * pathInfo structure. Warning, this destructively modifies the argument.
     */
    fluid.url.cononocolosePath = function(pathInfo) {
        var consume = 0;
        for (var i = 0; i < pathInfo.length; ++ i) {
            if (pathInfo[i] === "..") {
                ++consume;
            }
            else if (consume !== 0) {
                pathInfo.splice(i - consume*2, consume*2);
                i -= consume * 2;
                consume = 0;
            }
        }
        return pathInfo;
    };
    
    // parseUri 1.2.2
    // (c) Steven Levithan <stevenlevithan.com>
    // MIT License
    
    fluid.url.parseUri = function (str) {
        var o  = fluid.url.parseUri.options,
          m   = o.parser[o.strictMode ? "strict" : "loose"].exec(str),
          uri = {},
          i   = 14;
      
        while (i--) uri[o.key[i]] = m[i] || "";
      
        uri[o.q.name] = {};
        uri[o.key[12]].replace(o.q.parser, function ($0, $1, $2) {
            if ($1) uri[o.q.name][$1] = $2;
        });
      
        return uri;
    };
    
    fluid.url.parseUri.options = {
        strictMode: true,
        key: ["source","protocol","authority","userInfo","user","password","host","port","relative","path","directory","file","query","anchor"],
        q:   {
            name:   "queryKey",
            parser: /(?:^|&)([^&=]*)=?([^&]*)/g
        },
        parser: {
            strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,
            loose:  /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/
        }
    };
    
    fluid.url.parseSegs = function(url) {
        var parsed = fluid.url.parseUri(url);
        var parsedSegs = fluid.url.parsePathInfoTrim(parsed.directory);
        return parsedSegs.pathInfo;
    };
    
    fluid.url.isAbsoluteUrl = function(url) {
        var parseRel = fluid.url.parseUri(url);
        return (parseRel.host || parseRel.protocol || parseRel.directory.charAt(0) === '/');
    };
    
    fluid.url.computeRelativePrefix = function(outerLocation, iframeLocation, relPath) {
        if (fluid.url.isAbsoluteUrl(relPath)) {
            return relPath;
        }
        var relSegs = fluid.url.parsePathInfo(relPath).pathInfo;
        var parsedOuter = fluid.url.parseSegs(outerLocation);
        var parsedRel = parsedOuter.concat(relSegs);
        fluid.url.cononocolosePath(parsedRel);
        var parsedInner = fluid.url.parseSegs(iframeLocation);
        var seg = 0;
        for (; seg < parsedRel.length; ++ seg) {
            if (parsedRel[seg] != parsedInner[seg]) break;  
        }
        var excess = parsedInner.length - seg;
        var back = fluid.url.generateDepth(excess);
        var front = fluid.url.collapseSegs(parsedRel, seg);
        return back + front;
    };
    
})(jQuery, fluid_1_5);/*
Copyright 2013 OCAD University

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global fluid_1_5:true*/

// JSLint options 
/*jslint white: true, funcinvoke: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

var fluid_1_5 = fluid_1_5 || {};

(function (fluid) {

    fluid.registerNamespace("fluid.uiOptions");

    fluid.uiOptions.messages = {

        // UI Options Text Font Settings Panel
        // Note: if you modify these, you need to update the appropriate
        // controlValues in fluid.uiOptions.panels.textFont component options.
        textFont: ["Default", "Times New Roman", "Comic Sans", "Arial",
            "Verdana"],
        textFontLabel: "Text Style",

        // UI Options Contrast Settings Panel
        // Note: if you modify these, you need to update the appropriate
        // controlValues in fluid.uiOptions.panels.contrast component options.
        theme: ["Default", "Black on white", "White on black", "Black on yellow",
            "Yellow on black"],
        contrastLabel: "Colour & Contrast",

        // Table of Contents Settings Panel
        tocLabel: "Table of Contents",
        tocChoiceLabel: "Add a table of contents",

        // Line spacing
        lineSpaceLabel: "Line Spacing",
        lineSpaceNarrowIcon: "icon of 3 horizontal lines with narrow spacing",
        lineSpaceWideIcon: "icon of 3 horizontal lines with wide spacing",

        // Links and Buttons
        linksLabel: "Links & buttons",
        linksChoiceLabel: "Underline and bold",
        inputsChoiceLabel: "Enlarge buttons, menus, text-fields, and other inputs",

        // Text Size
        textSizeLabel: "Text Size",
        textSizeSmallIcon: "icon of a small capital letter 'A'",
        textSizeLargeIcon: "icon of a large capital letter 'A'",

        // Shared
        multiplier: "times",
        
        // Sliding Panel
        slidingPanelShowText: "+ Show Display Preferences",
        slidingPanelHideText: "- Hide"        
    };

    fluid.staticEnvironment.uioMsgBundle = fluid.messageResolver({
        messageBase: fluid.uiOptions.messages
    });

})(fluid_1_5);/*
Copyright 2009 University of Toronto
Copyright 2011-2013 OCAD University

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global fluid_1_5:true, jQuery*/

// JSLint options 
/*jslint white: true, funcinvoke: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

var fluid_1_5 = fluid_1_5 || {};

(function ($, fluid) {

    /**
     * A Generic data source grade that defines an API for getting and setting
     * data.
     */
    fluid.defaults("fluid.uiOptions.dataSource", {
        gradeNames: ["fluid.littleComponent"],
        invokers: {
            get: "fluid.uiOptions.dataSource.get",
            set: "fluid.uiOptions.dataSource.set"
        }
    });

    /****************
     * Cookie Store *
     ****************/
     
    /**
     * SettingsStore Subcomponent that uses a cookie for persistence.
     * @param {Object} options
     */
    fluid.defaults("fluid.cookieStore", {
        gradeNames: ["fluid.uiOptions.dataSource", "autoInit"],
        cookie: {
            name: "fluid-ui-settings",
            path: "/",
            expires: ""
        }
    });

    fluid.demands("fluid.uiOptions.dataSource.get", "fluid.cookieStore", {
        funcName: "fluid.cookieStore.get",
        args: "{that}.options.cookie.name"
    });

    fluid.demands("fluid.uiOptions.dataSource.set", "fluid.cookieStore", {
        funcName: "fluid.cookieStore.set",
        args: ["{arguments}.0", "{that}.options.cookie"]
    });

    /**
     * Retrieve and return the value of the cookie
     */
    fluid.cookieStore.get = function (cookieName) {
        var cookie = document.cookie;
        if (cookie.length <= 0) {
            return;
        }

        var cookiePrefix = cookieName + "=";
        var startIndex = cookie.indexOf(cookiePrefix);
        if (startIndex < 0) {
            return;
        }

        startIndex = startIndex + cookiePrefix.length;
        var endIndex = cookie.indexOf(";", startIndex);
        if (endIndex < startIndex) {
            endIndex = cookie.length;
        }

        var retObj = JSON.parse(decodeURIComponent(cookie.substring(startIndex, endIndex)));
        return retObj;
    };
    
    /**
     * Assembles the cookie string
     * @param {Object} cookie settings
     */
    fluid.cookieStore.assembleCookie = function (cookieOptions) {
        var cookieStr = cookieOptions.name + "=" + cookieOptions.data;
        
        if (cookieOptions.expires) {
            cookieStr += "; expires=" + cookieOptions.expires;
        }
        
        if (cookieOptions.path) {
            cookieStr += "; path=" + cookieOptions.path;
        }
        
        return cookieStr;
    };

    /**
     * Saves the settings into a cookie
     * @param {Object} settings
     * @param {Object} cookieOptions
     */
    fluid.cookieStore.set = function (settings, cookieOptions) {
        cookieOptions.data = encodeURIComponent(JSON.stringify(settings));
        document.cookie = fluid.cookieStore.assembleCookie(cookieOptions);
    };
    

    /**************
     * Temp Store *
     **************/

    /**
     * SettingsStore Subcomponent that doesn't do persistence.
     * @param {Object} options
     */
    fluid.defaults("fluid.tempStore", {
        gradeNames: ["fluid.uiOptions.dataSource", "fluid.modelComponent", "autoInit"]
    });

    fluid.demands("fluid.uiOptions.dataSource.get", "fluid.tempStore", {
        funcName: "fluid.identity",
        args: "{that}.model"
    });

    fluid.demands("fluid.uiOptions.dataSource.set", "fluid.tempStore", {
        funcName: "fluid.tempStore.set",
        args: ["{arguments}.0", "{that}.applier"]
    });

    fluid.tempStore.set = function (settings, applier) {
        applier.requestChange("", settings);
    };

    fluid.defaults("fluid.globalSettingsStore", {
        gradeNames: ["autoInit", "fluid.littleComponent"],
        components: {
            settingsStore: {
                type: "fluid.uiOptions.store"
            }
        }
    });

    fluid.globalSettingsStore.finalInit = function (that) {
        fluid.staticEnvironment.settingsStore = that.settingsStore;
    };

    fluid.demands("fluid.uiOptions.store", ["fluid.globalSettingsStore"], {
        funcName: "fluid.cookieStore"
    });

})(jQuery, fluid_1_5);/*
Copyright 2013 OCAD University

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global fluid_1_5:true, fluid, jQuery, $*/

// JSLint options
/*jslint white: true, funcinvoke: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */


/********************
 * Textfield Slider *
 ********************/

fluid.defaults("fluid.textfieldSlider", {
    gradeNames: ["fluid.viewComponent", "autoInit"],
    components: {
        textfield: {
            type: "fluid.textfieldSlider.textfield",
            container: "{textfieldSlider}.dom.textfield",
            options: {
                model: "{textfieldSlider}.model",
                range: "{textfieldSlider}.options.range",
                applier: "{textfieldSlider}.applier"
            }
        },
        slider: {
            type: "fluid.textfieldSlider.slider",
            container: "{textfieldSlider}.dom.slider",
            options: {
                model: "{textfieldSlider}.model",
                range: "{textfieldSlider}.options.range",
                applier: "{textfieldSlider}.applier",
                sliderOptions: "{textfieldSlider}.options.sliderOptions"
            }
        }
    },
    selectors: {
        textfield: ".flc-textfieldSlider-field",
        slider: ".flc-textfieldSlider-slider"
    },
    events: {
        modelChanged: null,
        afterRender: null
    },
    listeners: {
        modelChanged: "{that}.refreshView"
    },
    model: {
        value: null
    },
    range: {
        min: 0,
        max: 100
    },
    sliderOptions: {
        orientation: "horizontal",
        step: 1.0
    },
    invokers: {
        refreshView: {
            funcName: "fluid.textfieldSlider.refreshView",
            args: ["{that}"]
        }
    },
    finalInitFunction: "fluid.textfieldSlider.finalInit",
    renderOnInit: true
});

fluid.textfieldSlider.finalInit = function (that) {

    that.applier.modelChanged.addListener("value", function (newModel) {
        that.events.modelChanged.fire(newModel.value);
    });

    if (that.options.renderOnInit) {
        that.refreshView();
    }
};

fluid.textfieldSlider.refreshView = function (that) {
    that.textfield.container.val(that.model.value);
    that.events.afterRender.fire(that);
};

fluid.defaults("fluid.textfieldSlider.textfield", {
    gradeNames: ["fluid.viewComponent", "autoInit"],
    listeners: {
        onCreate: {
            listener: "fluid.textfieldSlider.textfield.init",
            args: "{that}"
        }
    },
    range: {} // should be used to specify the min, max range e.g. {min: 0, max: 100}
});

fluid.textfieldSlider.validateValue = function (model, range, changeRequest) {
    var oldValue = model.value;
    var newValue = changeRequest.value;

    var isValidNum = !isNaN(parseInt(newValue, 10));

    if (isValidNum) {
        if (newValue < range.min) {
            newValue = range.min;
        } else if (newValue > range.max) {
            newValue = range.max;
        }
        changeRequest.value = newValue;
    } else {
        changeRequest.value = oldValue;
    }
};

fluid.textfieldSlider.textfield.init = function (that) {
    that.applier.guards.addListener({path: "value", transactional: true}, function (model, changeRequest) {
        fluid.textfieldSlider.validateValue(model, that.options.range, changeRequest);
    });

    that.container.change(function (source) {
        that.applier.requestChange("value", source.target.value);
    });
};

fluid.defaults("fluid.textfieldSlider.slider", {
    gradeNames: ["fluid.viewComponent", "autoInit"],
    selectors: {
        thumb: ".ui-slider-handle"
    },
    events: {
        modelChanged: null
    },
    listeners: {
        onCreate: {
            listener: "fluid.textfieldSlider.slider.init",
            args: "{that}"
        }
    },
    range: {} // should be used to specify the min, max range e.g. {min: 0, max: 100}
});

// This will be removed once the jQuery UI slider has built in ARIA
var initSliderAria = function (thumb, opts) {
    var ariaDefaults = {
        role: "slider",
        "aria-valuenow": opts.value,
        "aria-valuemin": opts.min,
        "aria-valuemax": opts.max
    };
    thumb.attr(ariaDefaults);
};

fluid.textfieldSlider.slider.init = function (that) {
    // To support backwards compatability, the range data can still be store in the model.
    var sliderOptions = jQuery.extend(true, {}, that.options.sliderOptions, that.model, that.options.range);

    that.slider = that.container.slider(sliderOptions);
    initSliderAria(that.locate("thumb"), sliderOptions);

    that.setSliderValue = function (value) {
        that.slider.slider("value", value);
    };

    that.setSliderAria = function (value) {
        that.locate("thumb").attr("aria-valuenow", value);
    };

    that.slider.bind("slide", function (e, ui) {
        that.applier.requestChange("value", ui.value);
    });

    that.applier.modelChanged.addListener("value", function (newModel) {
        that.setSliderValue(newModel.value);
        that.setSliderAria(newModel.value);
        that.events.modelChanged.fire(newModel.value);
    });

};/*
Copyright 2009 University of Toronto
Copyright 2010-2011 OCAD University
Copyright 2011 Lucendo Development Ltd.

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global fluid_1_5:true, jQuery*/

// JSLint options
/*jslint white: true, funcinvoke: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

var fluid_1_5 = fluid_1_5 || {};

(function ($, fluid) {

    /*********************
     * UI Options Inline *
     *********************/

    /**
     * An UI Options top-level component that reflects the collaboration between uiOptionsLoader
     * and templateLoader. This component is the only UI Options component that is intended to be
     * called by the outside world.
     *
     * @param {Object} options
     */
    fluid.defaults("fluid.uiOptions.inline", {
        gradeNames: ["fluid.viewComponent", "autoInit"],
        components: {
            uiOptionsLoader: {
                type: "fluid.uiOptions.loader"
            },
            templateLoader: {
                priority: "first",
                type: "fluid.uiOptions.templateLoader"
            }
        },
        container: "{that}.container",
        distributeOptions: [{
            source: "{that}.options.templateLoader.options",
            removeSource: true,
            target: "{that templateLoader}.options"
        }, {
            source: "{that}.options.prefix",
            target: "{that templatePath}.options.value"
        }, {
            source: "{that}.options.uiOptionsLoader.options",
            removeSource: true,
            target: "{that > uiOptionsLoader}.options"
        }, {
            source: "{that}.options.uiOptions.options",
            removeSource: true,
            target: "{that uiOptions}.options"
        }, {
            source: "{that}.options.container",
            removeSource: true,
            target: "{that > uiOptionsLoader}.container"
        }]
    });
    
    fluid.defaults("fluid.uiOptions.transformDefaultPanelsOptions", {
        gradeNames: ["fluid.uiOptions.inline", "autoInit"],
        distributeOptions: [{
            source: "{that}.options.textSize.options",
            removeSource: true,
            target: "{that textSize}.options"
        }, {
            source: "{that}.options.lineSpace.options",
            removeSource: true,
            target: "{that lineSpace}.options"
        }, {
            source: "{that}.options.textFont.options",
            removeSource: true,
            target: "{that textFont}.options"
        }, {
            source: "{that}.options.contrast.options",
            removeSource: true,
            target: "{that contrast}.options"
        }, {
            source: "{that}.options.layoutControls.options",
            removeSource: true,
            target: "{that layoutControls}.options"
        }, {
            source: "{that}.options.linksControls.options",
            removeSource: true,
            target: "{that linksControls}.options"
        }]
    });

    /******************************
     * UI Options Template Loader *
     ******************************/

    /**
     * A configurable component that works in conjunction with or without the UI Options template path
     * component (fluid.uiOptionsTemplatePath) to allow users to set either the location of their own
     * templates or the templates that are relative to the path defined in the UI Options template path
     * component.
     *
     * @param {Object} options
     */

    fluid.defaults("fluid.uiOptions.templateLoader", {
        gradeNames: ["fluid.eventedComponent", "autoInit"],
        finalInitFunction: "fluid.uiOptions.templateLoader.resolveTemplates",
        templates: {
            uiOptions: "%prefix/FatPanelUIOptions.html"
        },
        // Unsupported, non-API option
        components: {
            templatePath: {
                type: "fluid.uiOptions.templatePath"
            }
        },
        invokers: {
            transformURL: {
                funcName: "fluid.stringTemplate",
                args: [ "{arguments}.0", { "prefix/" : "{templateLoader}.templatePath.options.value"} ]
            }
        }
    });

    fluid.uiOptions.templateLoader.resolveTemplates = function (that) {
        var mapped = fluid.transform(that.options.templates, that.transformURL);

        that.resources = fluid.transform(mapped, function (url) {
            return {url: url, forceCache: true};
        });
    };

    /**************************************
     * UI Options Template Path Specifier *
     **************************************/

    /**
     * A configurable component that defines the relative path from the html to UI Options templates.
     *
     * @param {Object} options
     */

    fluid.defaults("fluid.uiOptions.templatePath", {
        gradeNames: ["fluid.littleComponent", "autoInit"],
        value: "../html/"
    });

    /**************
     * UI Options *
     **************/

    fluid.defaults("fluid.uiOptions.loader", {
        gradeNames: ["fluid.viewComponent", "autoInit"],
        resources: "{templateLoader}.resources",
        events: {
            // These two are events private to uiOptions
            onUIOptionsTemplateReady: null, // templates are loaded - construct UIOptions itself
            onUIOptionsComponentReady: null, // UIOptions is loaded - construct its subcomponents
            // This is a public event which users outside the component can subscribe to - the argument
            // supplied is UIOptions.loader itself
            onReady: null
        },
        listeners: {
            onUIOptionsComponentReady: {
                listener: "{loader}.events.onReady",
                args: ["{fluid.uiOptions.loader}", "{arguments}.0"],
                priority: "last"
            },
            onCreate: {
                listener: "fluid.uiOptions.loader.init",
                args: "{that}"
            }
        },
        components: {
            uiOptions: {
                type: "fluid.uiOptions",
                container: "{loader}.container",
                createOnEvent: "onUIOptionsTemplateReady",
                options: {
                    events: {
                        "onUIOptionsComponentReady": "{loader}.events.onUIOptionsComponentReady"
                    }
                }
            }
        }
    });

    fluid.uiOptions.loader.init = function (that) {
        fluid.fetchResources(that.options.resources, function () {
            that.events.onUIOptionsTemplateReady.fire();
        });
    };

    /**
     * A component that works in conjunction with the UI Enhancer component and the Fluid Skinning System (FSS)
     * to allow users to set personal user interface preferences. The UI Options component provides a user
     * interface for setting and saving personal preferences, and the UI Enhancer component carries out the
     * work of applying those preferences to the user interface.
     *
     * @param {Object} container
     * @param {Object} options
     */
    fluid.defaults("fluid.uiOptions", {
        gradeNames: ["fluid.viewComponent", "fluid.uiOptions.settingsGetter", "fluid.uiOptions.settingsSetter", "fluid.uiOptions.rootModel", "autoInit"],
        components: {
            eventBinder: {
                type: "fluid.uiOptions.eventBinder"
            }
        },
        invokers: {
            /**
             * Updates the change applier and fires modelChanged on subcomponent fluid.uiOptions.controls
             *
             * @param {Object} newModel
             * @param {Object} source
             */
            updateModel: {
                funcName: "fluid.fireSourcedChange",
                args: ["{that}.applier", "selections", "{arguments}.0", "{arguments}.1"]
            }
        },
        selectors: {
            cancel: ".flc-uiOptions-cancel",
            reset: ".flc-uiOptions-reset",
            save: ".flc-uiOptions-save",
            previewFrame : ".flc-uiOptions-preview-frame"
        },
        events: {
            onSave: null,
            onCancel: null,
            onReset: null,
            onAutoSave: null,
            modelChanged: null,
            onUIOptionsRefresh: null,
            onUIOptionsMarkupReady: null,
            onUIOptionsComponentReady: null
        },
        listeners: {
            onAutoSave: "{that}.save"
        },
        resources: {
            template: "{templateLoader}.resources.uiOptions"
        },
        autoSave: false
    });

    fluid.defaults("fluid.uiOptions.settingsGetter", {
        gradeNames: ["fluid.littleComponent", "autoInit"],
        members: {
            getSettings: "{settingsStore}.get"
        }
    });

    fluid.defaults("fluid.uiOptions.settingsSetter", {
        gradeNames: ["fluid.littleComponent", "autoInit"],
        invokers: {
            setSettings: {
                funcName: "fluid.uiOptions.settingsSetter.setSettings",
                args: ["{arguments}.0", "{settingsStore}.set"]
            }
        }
    });

    fluid.uiOptions.settingsSetter.setSettings = function (model, set) {
        var userSettings = fluid.copy(model);
        set(userSettings);
    };

    fluid.defaults("fluid.uiOptions.rootModel", {
        gradeNames: ["fluid.littleComponent", "autoInit"],
        members: {
            // TODO: This information is supposed to be generated from the JSON
            // schema describing various preferences. For now it's kept in top
            // level uiOptions to avoid further duplication.
            rootModel: {}
        }
    });

    fluid.defaults("fluid.uiOptions.rootModel.starter", {
        gradeNames: ["fluid.uiOptions.rootModel", "autoInit"],
        members: {
            // TODO: This information is supposed to be generated from the JSON
            // schema describing various preferences. For now it's kept in top
            // level uiOptions to avoid further duplication.
            rootModel: {
                textFont: "default",          // key from classname map
                theme: "default",             // key from classname map
                textSize: 1,                  // in points
                lineSpace: 1,               // in ems
                toc: false,                   // boolean
                links: false,                 // boolean
                inputsLarger: false           // boolean
            }
        }
    });

    fluid.defaults("fluid.uiOptions.uiEnhancerRelay", {
        gradeNames: ["autoInit", "fluid.eventedComponent"],
        listeners: {
            onCreate: "{that}.addListener",
            onDestroy: "{that}.removeListener"
        },
        events: {
            updateEnhancerModel: "{fluid.uiOptions}.events.onUIOptionsRefresh"
        },
        invokers: {
            addListener: {
                funcName: "fluid.uiOptions.uiEnhancerRelay.addListener",
                args: ["{that}.events.updateEnhancerModel", "{that}.updateEnhancerModel"]
            },
            removeListener: {
                funcName: "fluid.uiOptions.uiEnhancerRelay.removeListener",
                args: ["{that}.events.updateEnhancerModel", "{that}.updateEnhancerModel"]
            },
            updateEnhancerModel: {
                funcName: "fluid.uiOptions.uiEnhancerRelay.updateEnhancerModel",
                args: ["{uiEnhancer}", "{fluid.uiOptions}.model.selections"]
            }
        }
    });

    fluid.uiOptions.uiEnhancerRelay.addListener = function (modelChanged, listener) {
        modelChanged.addListener(listener);
    };

    fluid.uiOptions.uiEnhancerRelay.removeListener = function (modelChanged, listener) {
        modelChanged.removeListener(listener);
    };

    fluid.uiOptions.uiEnhancerRelay.updateEnhancerModel = function (uiEnhancer, newModel) {
        uiEnhancer.updateModel(newModel);
    };

    // called once markup is applied to the document containing tab component roots
    fluid.uiOptions.finishInit = function (that) {
        var bindHandlers = function (that) {
            var saveButton = that.locate("save");
            if (saveButton.length > 0) {
                saveButton.click(that.saveAndApply);
                var form = fluid.findForm(saveButton);
                $(form).submit(function () {
                    that.saveAndApply();
                });
            }
            that.locate("reset").click(that.reset);
            that.locate("cancel").click(that.cancel);
        };

        that.container.append(that.options.resources.template.resourceText);
        bindHandlers(that);
        // This creates subcomponents - we can find default model afterwards
        that.events.onUIOptionsMarkupReady.fire(that);

        that.fetch();
        that.events.onUIOptionsComponentReady.fire(that);
    };

    fluid.uiOptions.preInit = function (that) {
        that.fetch = function () {
            var completeModel = that.getSettings();
            completeModel = $.extend(true, {}, that.rootModel, completeModel);
            that.updateModel(completeModel, "settingsStore");
            that.events.onUIOptionsRefresh.fire();
        };

        /**
         * Saves the current model and fires onSave
         */
        that.save = function () {
            that.events.onSave.fire(that.model.selections);

            var savedSelections = fluid.copy(that.model.selections);
            that.setSettings(savedSelections);
        };

        that.saveAndApply = function () {
            that.save();
            that.events.onUIOptionsRefresh.fire();
        };

        /**
         * Resets the selections to the integrator's defaults and fires onReset
         */
        that.reset = function () {
            that.updateModel(fluid.copy(that.rootModel));
            that.events.onReset.fire(that);
            that.events.onUIOptionsRefresh.fire();
        };

        /**
         * Resets the selections to the last saved selections and fires onCancel
         */
        that.cancel = function () {
            that.events.onCancel.fire();
            that.fetch();
        };

        that.applier.modelChanged.addListener("selections", function (newModel, oldModel, changeRequest) {
            that.events.modelChanged.fire(newModel, oldModel, changeRequest[0].source);
            if (that.options.autoSave) {
                that.events.onAutoSave.fire();
            }
        });
    };

    fluid.uiOptions.finalInit = function (that) {
        fluid.fetchResources(that.options.resources, function () {
          // This setTimeout is to ensure that fetching of resources is asynchronous,
          // and so that component construction does not run ahead of subcomponents for FatPanel
          // (FLUID-4453 - this may be a replacement for a branch removed for a FLUID-2248 fix)
            setTimeout(function () {
                fluid.uiOptions.finishInit(that);
            }, 1);
        });
    };

    /***********************************************
     * Base grade panels
     ***********************************************/

    fluid.defaults("fluid.uiOptions.panels", {
        gradeNames: ["fluid.rendererComponent", "fluid.uiOptions.modelRelay", "autoInit"],
        invokers: {
            refreshView: "{that}.renderer.refreshView"
        },
        strings: {},
        parentBundle: "{uioMsgBundle}"
    });

    /******************************************************
     * UI Options Event binder:                           *
     * Binds events between UI Options and the UIEnhancer *
     ******************************************************/

    fluid.defaults("fluid.uiOptions.eventBinder", {
        gradeNames: ["fluid.eventedComponent", "autoInit"]
    });

    /**********************
     * UI Options Preview *
     **********************/

    fluid.defaults("fluid.uiOptions.preview", {
        gradeNames: ["fluid.viewComponent", "autoInit"],
        components: {
            enhancer: {
                type: "fluid.uiEnhancer",
                container: "{preview}.enhancerContainer",
                createOnEvent: "onReady",
                options: {
                    gradeNames: ["fluid.uiOptions.uiEnhancerRelay"]
                }
            },
            // TODO: This is a violation of containment, but we can't use up our allowance of demands
            // blocks as a result of FLUID-4392
            templateLoader: "{templateLoader}"
        },
        invokers: {
            updateModel: {
                funcName: "fluid.uiOptions.preview.updateModel",
                args: [
                    "{preview}",
                    "{uiOptions}.model.selections"
                ]
            }
        },
        finalInitFunction: "fluid.uiOptions.preview.finalInit",
        events: {
            onReady: null
        },
        listeners: {
            "{uiOptions}.events.modelChanged": "{that}.updateModel",
            onReady: "{that}.updateModel"
        },
        templateUrl: "%prefix/UIOptionsPreview.html"
    });

    fluid.uiOptions.preview.updateModel = function (that, selections) {
        /**
         * SetTimeout is temp fix for http://issues.fluidproject.org/browse/FLUID-2248
         */
        setTimeout(function () {
            if (that.enhancer) {
                that.enhancer.updateModel(selections);
            }
        }, 0);
    };

    fluid.uiOptions.preview.finalInit = function (that) {
        var templateUrl = that.templateLoader.transformURL(that.options.templateUrl);
        that.container.load(function () {
            that.enhancerContainer = $("body", that.container.contents());
            that.events.onReady.fire();
        });
        that.container.attr("src", templateUrl);

    };

})(jQuery, fluid_1_5);
/*
Copyright 2013 OCAD University

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global fluid_1_5:true, jQuery*/

// JSLint options
/*jslint white: true, funcinvoke: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

var fluid_1_5 = fluid_1_5 || {};


(function ($, fluid) {

    /********************************
     * UI Options Text Field Slider *
     ********************************/

    fluid.defaults("fluid.uiOptions.textfieldSlider", {
        gradeNames: ["fluid.textfieldSlider", "autoInit"],
        model: "{fluid.uiOptions.panels}.model",
        range: "{fluid.uiOptions.panels}.options.range",
        listeners: {
            modelChanged: {
                listener: "{fluid.uiOptions.panels}.applier.requestChange",
                args: ["{that}.options.path", "{arguments}.0"]
            }
        },
        path: "value",
        sliderOptions: "{fluid.uiOptions.panels}.options.sliderOptions"
    });

    /************************
     * UI Options Text Size *
     ************************/

    /**
     * A sub-component of fluid.uiOptions that renders the "text size" panel of the user preferences interface.
     */
    fluid.defaults("fluid.uiOptions.panels.textSize", {
        gradeNames: ["fluid.uiOptions.panels", "autoInit"],
        // The default model values represent both the expected format as well as the setting to be applied in the absence of values passed down to the component.
        // i.e. from the settings store, or specific defaults derived from schema.
        // Note: Except for being passed down to its subcomponent, these default values are not contributed and shared out
        range: {
            min: 1,
            max: 2
        },
        selectors: {
            textSize: ".flc-uiOptions-min-text-size",
            label: ".flc-uiOptions-min-text-size-label",
            smallIcon: ".flc-uiOptions-min-text-size-smallIcon",
            largeIcon: ".flc-uiOptions-min-text-size-largeIcon",
            multiplier: ".flc-uiOptions-multiplier"
        },
        protoTree: {
            label: {messagekey: "textSizeLabel"},
            smallIcon: {messagekey: "textSizeSmallIcon"},
            largeIcon: {messagekey: "textSizeLargeIcon"},
            multiplier: {messagekey: "multiplier"},
            textSize: {
                decorators: {
                    type: "fluid",
                    func: "fluid.uiOptions.textfieldSlider"
                }
            }
        },
        sliderOptions: {
            orientation: "horizontal",
            step: 0.1,
            range: "min"
        }
    });

    /************************
     * UI Options Text Font *
     ************************/

    /**
     * A sub-component of fluid.uiOptions that renders the "text font" panel of the user preferences interface.
     */
    fluid.defaults("fluid.uiOptions.panels.textFont", {
        gradeNames: ["fluid.uiOptions.panels", "autoInit"],
        selectors: {
            textFont: ".flc-uiOptions-text-font",
            label: ".flc-uiOptions-text-font-label"
        },
        strings: {
            textFont: "{uioMsgBundle}.options.messageBase.textFont"
        },
        produceTree: "fluid.uiOptions.panels.textFont.produceTree",
        classnameMap: null, // must be supplied by implementors
        controlValues: {
            textFont: ["default", "times", "comic", "arial", "verdana"]
        }
    });
    
    fluid.uiOptions.panels.textFont.produceTree = function (that) {
        // render drop down list box
        return {
            label: {messagekey: "textFontLabel"},
            textFont: {
                optionnames: that.options.strings.textFont,
                optionlist: that.options.controlValues.textFont,
                selection: "${value}",
                decorators: {
                    type: "fluid",
                    func: "fluid.uiOptions.selectDecorator",
                    options: {
                        styles: that.options.classnameMap.textFont
                    }
                }
            }
        };
    };

    /*************************
     * UI Options Line Space *
     *************************/

    /**
     * A sub-component of fluid.uiOptions that renders the "line space" panel of the user preferences interface.
     */
    fluid.defaults("fluid.uiOptions.panels.lineSpace", {
        gradeNames: ["fluid.uiOptions.panels", "autoInit"],
        // The default model values represent both the expected format as well as the setting to be applied in the absence of values passed down to the component.
        // i.e. from the settings store, or specific defaults derived from schema.
        // Note: Except for being passed down to its subcomponent, these default values are not contributed and shared out
        range: {
            min: 1,
            max: 2
        },
        selectors: {
            lineSpace: ".flc-uiOptions-line-space",
            label: ".flc-uiOptions-line-space-label",
            narrowIcon: ".flc-uiOptions-line-space-narrowIcon",
            wideIcon: ".flc-uiOptions-line-space-wideIcon",
            multiplier: ".flc-uiOptions-multiplier"
        },
        protoTree: {
            label: {messagekey: "lineSpaceLabel"},
            narrowIcon: {messagekey: "lineSpaceNarrowIcon"},
            wideIcon: {messagekey: "lineSpaceWideIcon"},
            multiplier: {messagekey: "multiplier"},
            lineSpace: {
                decorators: {
                    type: "fluid",
                    func: "fluid.uiOptions.textfieldSlider"
                }
            }
        },
        sliderOptions: {
            orientation: "horizontal",
            step: 0.1,
            range: "min"
        }
    });

    /***********************
     * UI Options Contrast *
     ***********************/

    /**
     * A sub-component of fluid.uiOptions that renders the "contrast" panel of the user preferences interface.
     */
    fluid.defaults("fluid.uiOptions.panels.contrast", {
        gradeNames: ["fluid.uiOptions.panels", "autoInit"],
        listeners: {
            afterRender: "{that}.style"
        },
        selectors: {
            themeRow: ".flc-uiOptions-themeRow",
            themeLabel: ".flc-uiOptions-theme-label",
            themeInput: ".flc-uiOptions-themeInput",
            label: ".flc-uiOptions-contrast-label"
        },
        strings: {
            theme: "{uioMsgBundle}.options.messageBase.theme"
        },
        repeatingSelectors: ["themeRow"],
        produceTree: "fluid.uiOptions.panels.contrast.produceTree",
        controlValues: {
            theme: ["default", "bw", "wb", "by", "yb"]
        },
        markup: {
            label: "<span class=\"fl-preview-A\">A</span><span class=\"fl-hidden-accessible\">%theme</span><div class=\"fl-crossout\"></div>"
        },
        invokers: {
            style: {
                funcName: "fluid.uiOptions.panels.contrast.style",
                args: ["{that}.dom.themeLabel", "{that}.options.strings.theme",
                    "{that}.options.markup.label", "{that}.options.controlValues.theme",
                    "{that}.options.classnameMap.theme"]
            }
        }
    });

    fluid.uiOptions.panels.contrast.style = function (labels, strings, markup, theme, style) {
        fluid.each(labels, function (label, index) {
            label = $(label);
            label.html(fluid.stringTemplate(markup, {
                theme: strings[index]
            }));
            label.addClass(style[theme[index]]);
        });
    };
    
    fluid.uiOptions.panels.contrast.produceTree = function (that) {
        return {
            label: {messagekey: "contrastLabel"},
            expander: {
                type: "fluid.renderer.selection.inputs",
                rowID: "themeRow",
                labelID: "themeLabel",
                inputID: "themeInput",
                selectID: "theme-radio",
                tree: {
                    optionnames: that.options.strings.theme,
                    optionlist: that.options.controlValues.theme,
                    selection: "${value}"
                }
            }
        };
    };

    /******************************
     * UI Options Layout Controls *
     ******************************/

    /**
     * A sub-component of fluid.uiOptions that renders the "layout and navigation" panel of the user preferences interface.
     */
    fluid.defaults("fluid.uiOptions.panels.layoutControls", {
        gradeNames: ["fluid.uiOptions.panels", "autoInit"],
        selectors: {
            toc: ".flc-uiOptions-toc",
            label: ".flc-uiOptions-toc-label",
            choiceLabel: ".flc-uiOptions-toc-choice-label"
        },
        protoTree: {
            label: {messagekey: "tocLabel"},
            choiceLabel: {messagekey: "tocChoiceLabel"},
            toc: "${toc}"
        }
    });

    /*****************************
     * UI Options Links Controls *
     *****************************/
    /**
     * A sub-component of fluid.uiOptions that renders the "links and buttons" panel of the user preferences interface.
     */
    fluid.defaults("fluid.uiOptions.panels.linksControls", {
        gradeNames: ["fluid.uiOptions.panels", "autoInit"],
        selectors: {
            links: ".flc-uiOptions-links",
            inputsLarger: ".flc-uiOptions-inputs-larger",
            label: ".flc-uiOptions-links-label",
            linksChoiceLabel: ".flc-uiOptions-links-choice-label",
            inputsChoiceLabel: ".flc-uiOptions-links-inputs-choice-label"
        },
        protoTree: {
            label: {messagekey: "linksLabel"},
            linksChoiceLabel: {messagekey: "linksChoiceLabel"},
            inputsChoiceLabel: {messagekey: "inputsChoiceLabel"},
            links: "${links}",
            inputsLarger: "${inputsLarger}"
        }
    });

    /************************************************
     * UI Options Select Dropdown Options Decorator *
     ************************************************/

    /**
     * A sub-component that decorates the options on the select dropdown list box with the css style
     */
    fluid.defaults("fluid.uiOptions.selectDecorator", {
        gradeNames: ["fluid.viewComponent", "autoInit"],
        listeners: {
            onCreate: "fluid.uiOptions.selectDecorator.decorateOptions"
        },
        styles: {
            preview: "fl-preview-theme"
        }
    });

    fluid.uiOptions.selectDecorator.decorateOptions = function (that) {
        fluid.each($("option", that.container), function (option) {
            var styles = that.options.styles;
            $(option).addClass(styles.preview + " " + styles[fluid.value(option)]);
        });
    };

    /************************************************************************
     * The grade that contains shared options by all default settings panels
     ************************************************************************/
    
    fluid.defaults("fluid.uiOptions.defaultPanel", {
        gradeNames: ["fluid.eventedComponent", "autoInit"],
        mergePolicy: {
            sourceApplier: "nomerge"
        },
        sourceApplier: "{fluid.uiOptions}.applier",
        listeners: {
            "{uiOptions}.events.onUIOptionsRefresh": "{fluid.uiOptions.panels}.refreshView"
        }
    });

    /*********************************************************************************************************
     * Starter Settings Panels
     *
     * A collection of all the default UIO setting panels.
     *********************************************************************************************************/
    fluid.defaults("fluid.uiOptions.starterPanels", {
        gradeNames: ["fluid.uiOptions", "autoInit"],
        selectors: {
            textSize: ".flc-uiOptions-text-size",
            textFont: ".flc-uiOptions-text-font",
            lineSpace: ".flc-uiOptions-line-space",
            contrast: ".flc-uiOptions-contrast",
            textControls: ".flc-uiOptions-text-controls",
            layoutControls: ".flc-uiOptions-layout-controls",
            linksControls: ".flc-uiOptions-links-controls"
        },
        components: {
            textSize: {
                type: "fluid.uiOptions.panels.textSize",
                container: "{uiOptions}.dom.textSize",
                createOnEvent: "onUIOptionsMarkupReady",
                options: {
                    gradeNames: "fluid.uiOptions.defaultPanel",
                    rules: {
                        "selections.textSize": "value"
                    },
                    model: {
                        value: "{fluid.uiOptions.rootModel}.rootModel.textSize"
                    },
                    resources: {
                        template: "{templateLoader}.resources.textSize"
                    }
                }
            },
            lineSpace: {
                type: "fluid.uiOptions.panels.lineSpace",
                container: "{uiOptions}.dom.lineSpace",
                createOnEvent: "onUIOptionsMarkupReady",
                options: {
                    gradeNames: "fluid.uiOptions.defaultPanel",
                    rules: {
                        "selections.lineSpace": "value"
                    },
                    model: {
                        value: "{fluid.uiOptions.rootModel}.rootModel.lineSpace"
                    },
                    resources: {
                        template: "{templateLoader}.resources.lineSpace"
                    }
                }
            },
            textFont: {
                type: "fluid.uiOptions.panels.textFont",
                container: "{uiOptions}.dom.textFont",
                createOnEvent: "onUIOptionsMarkupReady",
                options: {
                    gradeNames: "fluid.uiOptions.defaultPanel",
                    classnameMap: "{uiEnhancer}.options.classnameMap",
                    rules: {
                        "selections.textFont": "value"
                    },
                    model: {
                        value: "{fluid.uiOptions.rootModel}.rootModel.textFont"
                    },
                    resources: {
                        template: "{templateLoader}.resources.textFont"
                    }
                }
            },
            contrast: {
                type: "fluid.uiOptions.panels.contrast",
                container: "{uiOptions}.dom.contrast",
                createOnEvent: "onUIOptionsMarkupReady",
                options: {
                    gradeNames: "fluid.uiOptions.defaultPanel",
                    classnameMap: "{uiEnhancer}.options.classnameMap",
                    rules: {
                        "selections.theme": "value"
                    },
                    model: {
                        value: "{fluid.uiOptions.rootModel}.rootModel.theme"
                    },
                    resources: {
                        template: "{templateLoader}.resources.contrast"
                    }
                }
            },
            layoutControls: {
                type: "fluid.uiOptions.panels.layoutControls",
                container: "{uiOptions}.dom.layoutControls",
                createOnEvent: "onUIOptionsMarkupReady",
                options: {
                    gradeNames: "fluid.uiOptions.defaultPanel",
                    rules: {
                        "selections.toc": "toc"
                    },
                    model: {
                        toc: "{fluid.uiOptions.rootModel}.rootModel.toc"
                    },
                    resources: {
                        template: "{templateLoader}.resources.layoutControls"
                    }
                }
            },
            linksControls: {
                type: "fluid.uiOptions.panels.linksControls",
                container: "{uiOptions}.dom.linksControls",
                createOnEvent: "onUIOptionsMarkupReady",
                options: {
                    gradeNames: "fluid.uiOptions.defaultPanel",
                    rules: {
                        "selections.links": "links",
                        "selections.inputsLarger": "inputsLarger"
                    },
                    model: {
                        links: "{fluid.uiOptions.rootModel}.rootModel.links",
                        inputsLarger: "{fluid.uiOptions.rootModel}.rootModel.inputsLarger"
                    },
                    resources: {
                        template: "{templateLoader}.resources.linksControls"
                    }
                }
            }
        }
    });

    /******************************
     * Starter Template Loader
     ******************************/

    /**
     * A template loader component that specifies the templates used by starterPanels
     *
     * @param {Object} options
     */

    fluid.defaults("fluid.uiOptions.starterTemplateLoader", {
        gradeNames: ["fluid.uiOptions.templateLoader", "autoInit"],
        templates: {
            textSize: "%prefix/UIOptionsTemplate-textSize.html",
            textFont: "%prefix/UIOptionsTemplate-textFont.html",
            lineSpace: "%prefix/UIOptionsTemplate-lineSpace.html",
            contrast: "%prefix/UIOptionsTemplate-contrast.html",
            layoutControls: "%prefix/UIOptionsTemplate-layout.html",
            linksControls: "%prefix/UIOptionsTemplate-links.html"
        }
    });

})(jQuery, fluid_1_5);
/*
Copyright 2013 OCAD University

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global fluid_1_5:true, jQuery*/

// JSLint options 
/*jslint white: true, funcinvoke: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

var fluid_1_5 = fluid_1_5 || {};

(function ($, fluid) {

    /***************************************************************************************
     * modelRelay
     *
     * The "model relay" system - a framework sketch for a junction between an applier
     * bound to one model and another. It accepts (currently) one type of handler:
     * a simple string representing a direct relay between changes to one path and another
     ***************************************************************************************/

    fluid.defaults("fluid.uiOptions.modelRelay", {
        gradeNames: ["fluid.modelComponent", "fluid.eventedComponent", "autoInit"],
        mergePolicy: {
            sourceApplier: "nomerge"
        },
        listeners: {
            onCreate: "{that}.addListeners",
            onDestroy: "{that}.removeListeners"
        },
        invokers: {
            addListeners: {
                funcName: "fluid.uiOptions.modelRelay.addListeners",
                args: ["{that}.options.rules", "{that}.applier", "{that}.options.sourceApplier", "{that}.id"]
            },
            removeListeners: {
                funcName: "fluid.uiOptions.modelRelay.removeListeners",
                args: ["{that}.options.rules", "{that}.options.sourceApplier", "{that}.id"]
            }
        },
        sourceApplier: null,  // must be supplied by implementors
        rules: {}  // must be supplied by implementors, in format: "externalModelKey": "internalModelKey"
    });

    fluid.uiOptions.modelRelay.removeListeners = function (rules, applier, namespace) {
        fluid.each(rules, function () {
            applier.removeListener(namespace);
        });
    };

    fluid.uiOptions.modelRelay.addListeners = function (rules, applier, sourceApplier, namespace) {
        fluid.each(rules, function (internalKey, sourceKey) {
            fluid.addSourceGuardedListener(applier, internalKey, sourceKey, function (newModel) {
                fluid.fireSourcedChange(sourceApplier, sourceKey, fluid.get(newModel, internalKey), internalKey)
            });
            fluid.addSourceGuardedListener(sourceApplier, sourceKey, internalKey, function (newModel) {
                fluid.fireSourcedChange(applier, internalKey, fluid.get(newModel, sourceKey), sourceKey);
            }, undefined, namespace);
        });
    };

})(jQuery, fluid_1_5);
/*
Copyright 2013 OCAD University

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global fluid_1_5:true, jQuery*/

// JSLint options 
/*jslint white: true, funcinvoke: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

var fluid_1_5 = fluid_1_5 || {};

(function ($, fluid) {

    fluid.defaults("fluid.uiOptions.enactors", {
        gradeNames: ["fluid.modelComponent", "fluid.eventedComponent", "fluid.uiOptions.modelRelay", "autoInit"]
    });
    
    /**********************************************************************************
     * styleElements
     * 
     * Adds or removes the classname to/from the elements based upon the model value.
     * This component is used as a grade by emphasizeLinks & inputsLarger
     **********************************************************************************/
    fluid.defaults("fluid.uiOptions.enactors.styleElements", {
        gradeNames: ["fluid.uiOptions.enactors", "autoInit"],
        cssClass: null,  // Must be supplied by implementors
        invokers: {
            applyStyle: {
                funcName: "fluid.uiOptions.enactors.styleElements.applyStyle",
                args: ["{arguments}.0", "{arguments}.1"]
            },
            resetStyle: {
                funcName: "fluid.uiOptions.enactors.styleElements.resetStyle",
                args: ["{arguments}.0", "{arguments}.1"]
            },
            handleStyle: {
                funcName: "fluid.uiOptions.enactors.styleElements.handleStyle",
                args: ["{arguments}.0", {expander: {func: "{that}.getElements"}}, "{that}"]
            },
            
            // Must be supplied by implementors
            getElements: "fluid.uiOptions.enactors.getElements"
        },
        listeners: {
            onCreate: {
                listener: "{that}.handleStyle",
                args: ["{that}.model.value"]
            }
        }
    });
    
    fluid.uiOptions.enactors.styleElements.applyStyle = function (elements, cssClass) {
        elements.addClass(cssClass);
    };

    fluid.uiOptions.enactors.styleElements.resetStyle = function (elements, cssClass) {
        $(elements, "." + cssClass).andSelf().removeClass(cssClass);
    };

    fluid.uiOptions.enactors.styleElements.handleStyle = function (value, elements, that) {
        if (value) {
            that.applyStyle(elements, that.options.cssClass);
        } else {
            that.resetStyle(elements, that.options.cssClass);
        }
    };

    fluid.uiOptions.enactors.styleElements.finalInit = function (that) {
        that.applier.modelChanged.addListener("value", function (newModel) {
            that.handleStyle(newModel.value);
        });
    };
    
    /*******************************************************************************
     * emphasizeLinks
     * 
     * The enactor to emphasize links in the container according to the value
     *******************************************************************************/

    // Note that the implementors need to provide the container for this view component
    fluid.defaults("fluid.uiOptions.enactors.emphasizeLinks", {
        gradeNames: ["fluid.viewComponent", "fluid.uiOptions.enactors.styleElements", "autoInit"],
        cssClass: null,  // Must be supplied by implementors
        invokers: {
            getElements: {
                funcName: "fluid.uiOptions.enactors.emphasizeLinks.getLinks",
                args: "{that}.container"
            }
        }
    });
    
    fluid.uiOptions.enactors.emphasizeLinks.getLinks = function (container) {
        return $("a", container);
    };
    
    /*******************************************************************************
     * inputsLarger
     * 
     * The enactor to enlarge inputs in the container according to the value
     *******************************************************************************/

    // Note that the implementors need to provide the container for this view component
    fluid.defaults("fluid.uiOptions.enactors.inputsLarger", {
        gradeNames: ["fluid.viewComponent", "fluid.uiOptions.enactors.styleElements", "autoInit"],
        cssClass: null,  // Must be supplied by implementors
        invokers: {
            getElements: {
                funcName: "fluid.uiOptions.enactors.inputsLarger.getInputs",
                args: "{that}.container"
            }
        }
    });
    
    fluid.uiOptions.enactors.inputsLarger.getInputs = function (container) {
        return $("input, button", container);
    };
    
    /*******************************************************************************
     * ClassSwapper
     *
     * Has a hash of classes it cares about and will remove all those classes from
     * its container before setting the new class.
     * This component tends to be used as a grade by textFont and theme
     *******************************************************************************/
    
    // Note that the implementors need to provide the container for this view component
    fluid.defaults("fluid.uiOptions.enactors.classSwapper", {
        gradeNames: ["fluid.viewComponent", "fluid.uiOptions.enactors", "autoInit"],
        classes: {},  // Must be supplied by implementors
        invokers: {
            clearClasses: {
                funcName: "fluid.uiOptions.enactors.classSwapper.clearClasses",
                args: ["{that}.container", "{that}.classStr"]
            },
            swap: {
                funcName: "fluid.uiOptions.enactors.classSwapper.swap",
                args: ["{arguments}.0", "{that}"]
            }
        },
        listeners: {
            onCreate: {
                listener: "{that}.swap",
                args: ["{that}.model.value"]
            }
        },
        members: {
            classStr: {
                expander: {
                    func: "fluid.uiOptions.enactors.classSwapper.joinClassStr",
                    args: "{that}.options.classes"
                }
            }
        }
    });
    
    fluid.uiOptions.enactors.classSwapper.clearClasses = function (container, classStr) {
        container.removeClass(classStr);
    };
    
    fluid.uiOptions.enactors.classSwapper.swap = function (value, that) {
        that.clearClasses();
        that.container.addClass(that.options.classes[value]);
    };
    
    fluid.uiOptions.enactors.classSwapper.joinClassStr = function (classes) {
        var classStr = "";
        
        fluid.each(classes, function (oneClassName) {
            if (oneClassName) {
                classStr += classStr ? " " + oneClassName : oneClassName;
            }
        });
        return classStr;
    };
    
    fluid.uiOptions.enactors.classSwapper.finalInit = function (that) {
        that.applier.modelChanged.addListener("value", function (newModel) {
            that.swap(newModel.value);
        });
    };
    
    /*******************************************************************************
     * Functions shared by textSize and lineSpace
     *******************************************************************************/
    
    /**
     * return "font-size" in px
     * @param (Object) container
     * @param (Object) fontSizeMap: the mapping between the font size string values ("small", "medium" etc) to px values
     */
    fluid.uiOptions.enactors.getTextSizeInPx = function (container, fontSizeMap) {
        var fontSize = container.css("font-size");

        if (fontSizeMap[fontSize]) {
            fontSize = fontSizeMap[fontSize];
        }

        // return fontSize in px
        return parseFloat(fontSize);
    };

    /*******************************************************************************
     * textSize
     *
     * Sets the text size on the container to the multiple provided.
     *******************************************************************************/
    
    // Note that the implementors need to provide the container for this view component
    fluid.defaults("fluid.uiOptions.enactors.textSize", {
        gradeNames: ["fluid.viewComponent", "fluid.uiOptions.enactors", "autoInit"],
        fontSizeMap: {},  // must be supplied by implementors
        invokers: {
            set: {
                funcName: "fluid.uiOptions.enactors.textSize.set",
                args: ["{arguments}.0", "{that}"]
            },
            getTextSizeInPx: {
                funcName: "fluid.uiOptions.enactors.getTextSizeInPx",
                args: ["{that}.container", "{that}.options.fontSizeMap"]
            },
            getTextSizeInEm: {
                funcName: "fluid.uiOptions.enactors.textSize.getTextSizeInEm",
                args: [{expander: {func: "{that}.getTextSizeInPx"}}, {expander: {func: "{that}.getPx2EmFactor"}}]
            },
            getPx2EmFactor: {
                funcName: "fluid.uiOptions.enactors.textSize.getPx2EmFactor",
                args: ["{that}.container", "{that}.options.fontSizeMap"]
            }
        },
        listeners: {
            onCreate: {
                listener: "{that}.set",
                args: "{that}.model.value"
            }
        }
    });
    
    fluid.uiOptions.enactors.textSize.set = function (times, that) {
        // Calculating the initial size here rather than using a members expand because the "font-size"
        // cannot be detected on hidden containers such as fat paenl iframe.
        if (!that.initialSize) {
            that.initialSize = that.getTextSizeInEm();
        }
        
        if (that.initialSize) {
            var targetSize = times * that.initialSize;
            that.container.css("font-size", targetSize + "em");
        }
    };

    /**
     * Return "font-size" in em
     * @param (Object) container
     * @param (Object) fontSizeMap: the mapping between the font size string values ("small", "medium" etc) to px values
     */
    fluid.uiOptions.enactors.textSize.getTextSizeInEm = function (textSizeInPx, px2emFactor) {
        // retrieve fontSize in px, convert and return in em 
        return Math.round(textSizeInPx / px2emFactor * 10000) / 10000;
    };
    
    /**
     * Return the base font size used for converting text size from px to em
     */
    fluid.uiOptions.enactors.textSize.getPx2EmFactor = function (container, fontSizeMap) {
        // The base font size for converting text size to em is the computed font size of the container's 
        // parent element unless the container itself has been the DOM root element "HTML"
        // The reference to this algorithm: http://clagnut.com/blog/348/
        if (container.get(0).tagName !== "HTML") {
            container = container.parent();
        }
        return fluid.uiOptions.enactors.getTextSizeInPx(container, fontSizeMap);
    };

    fluid.uiOptions.enactors.textSize.finalInit = function (that) {
        that.applier.modelChanged.addListener("value", function (newModel) {
            that.set(newModel.value);
        });
    };
    
    /*******************************************************************************
     * lineSpace
     *
     * Sets the line space on the container to the multiple provided.
     *******************************************************************************/
    
    // Note that the implementors need to provide the container for this view component
    fluid.defaults("fluid.uiOptions.enactors.lineSpace", {
        gradeNames: ["fluid.viewComponent", "fluid.uiOptions.enactors", "autoInit"],
        fontSizeMap: {},  // must be supplied by implementors
        invokers: {
            set: {
                funcName: "fluid.uiOptions.enactors.lineSpace.set",
                args: ["{arguments}.0", "{that}"]
            },
            getTextSizeInPx: {
                funcName: "fluid.uiOptions.enactors.getTextSizeInPx",
                args: ["{that}.container", "{that}.options.fontSizeMap"]
            },
            getLineHeight: {
                funcName: "fluid.uiOptions.enactors.lineSpace.getLineHeight",
                args: "{that}.container"
            },
            numerizeLineHeight: {
                funcName: "fluid.uiOptions.enactors.lineSpace.numerizeLineHeight",
                args: [{expander: {func: "{that}.getLineHeight"}}, {expander: {func: "{that}.getTextSizeInPx"}}]
            }
        },
        listeners: {
            onCreate: {
                listener: "{that}.set",
                args: "{that}.model.value"
            }
        }
    });
    
    // Return "line-height" css value
    fluid.uiOptions.enactors.lineSpace.getLineHeight = function (container) {
        var lineHeight;
        
        // A work-around of jQuery + IE bug - http://bugs.jquery.com/ticket/2671
        if (container[0].currentStyle) {
            lineHeight = container[0].currentStyle.lineHeight;
        } else {
            lineHeight = container.css("line-height");
        }
        
        return lineHeight;
    };
    
    // Interprets browser returned "line-height" value, either a string "normal", a number with "px" suffix or "undefined" 
    // into a numeric value in em. 
    // Return 0 when the given "lineHeight" argument is "undefined" (http://issues.fluidproject.org/browse/FLUID-4500).
    fluid.uiOptions.enactors.lineSpace.numerizeLineHeight = function (lineHeight, fontSize) {
        // Handel the given "lineHeight" argument is "undefined", which occurs when firefox detects 
        // "line-height" css value on a hidden container. (http://issues.fluidproject.org/browse/FLUID-4500)
        if (!lineHeight) {
            return 0;
        }

        // Needs a better solution. For now, "line-height" value "normal" is defaulted to 1.2em
        // according to https://developer.mozilla.org/en/CSS/line-height
        if (lineHeight === "normal") {
            return 1.2;
        }
        
        // Continuing the work-around of jQuery + IE bug - http://bugs.jquery.com/ticket/2671
        if (lineHeight.match(/[0-9]$/)) {
            return lineHeight;
        }
        
        return Math.round(parseFloat(lineHeight) / fontSize * 100) / 100;
    };

    fluid.uiOptions.enactors.lineSpace.set = function (times, that) {
        // Calculating the initial size here rather than using a members expand because the "line-height"
        // cannot be detected on hidden containers such as fat paenl iframe.
        if (!that.initialSize) {
            that.initialSize = that.numerizeLineHeight();
        }
        
        // that.initialSize === 0 when the browser returned "lineHeight" css value is undefined,
        // which occurs when firefox detects "line-height" value on a hidden container.
        // @ See numerizeLineHeight() & http://issues.fluidproject.org/browse/FLUID-4500
        if (that.initialSize) {
            var targetLineSpace = times * that.initialSize;
            that.container.css("line-height", targetLineSpace);
        }
    };
    
    fluid.uiOptions.enactors.lineSpace.finalInit = function (that) {
        that.applier.modelChanged.addListener("value", function (newModel) {
            that.set(newModel.value);
        });
    };
    
    /*******************************************************************************
     * tableOfContents
     *
     * To create and show/hide table of contents
     *******************************************************************************/
    
    // Note that the implementors need to provide the container for this view component
    fluid.defaults("fluid.uiOptions.enactors.tableOfContents", {
        gradeNames: ["fluid.viewComponent", "fluid.uiOptions.enactors", "autoInit"],
        tocTemplate: null,  // must be supplied by implementors
        components: {
            tableOfContents: {
                type: "fluid.tableOfContents",
                container: "{fluid.uiOptions.enactors.tableOfContents}.container",
                createOnEvent: "onCreateTOCReady",
                options: {
                    components: {
                        levels: {
                            type: "fluid.tableOfContents.levels",
                            options: {
                                resources: {
                                    template: {
                                        forceCache: true,
                                        url: "{fluid.uiOptions.enactors.tableOfContents}.options.tocTemplate"
                                    }
                                }
                            } 
                        }
                    },
                    listeners: {
                        afterRender: "{fluid.uiOptions.enactors.tableOfContents}.events.afterTocRender"
                    }
                }
            }
        },
        invokers: {
            applyToc: {
                funcName: "fluid.uiOptions.enactors.tableOfContents.applyToc",
                args: ["{arguments}.0", "{that}"]
            }
        },
        events: {
            onCreateTOCReady: null,
            afterTocRender: null,
            onLateRefreshRelay: null
        },
        listeners: {
            onCreate: {
                listener: "{that}.applyToc",
                args: "{that}.model.value"
            }
        }
    });
    
    fluid.uiOptions.enactors.tableOfContents.applyToc = function (value, that) {
        var async = false;
        if (value) {
            if (that.tableOfContents) {
                that.tableOfContents.show();
            } else {
                that.events.onCreateTOCReady.fire();
                async = true;
            }
        } else {
            if (that.tableOfContents) {
                that.tableOfContents.hide();
            }
        }
        if (!async) {
            that.events.onLateRefreshRelay.fire(that);
        }
    };
    
    fluid.uiOptions.enactors.tableOfContents.finalInit = function (that) {
        that.applier.modelChanged.addListener("value", function (newModel) {
            that.applyToc(newModel.value);
        });
    };
    
})(jQuery, fluid_1_5);
/*
Copyright 2009 University of Toronto
Copyright 2010-2011 OCAD University
Copyright 2011 Lucendo Development Ltd.

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global fluid_1_5:true, jQuery*/

// JSLint options 
/*jslint white: true, funcinvoke: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

var fluid_1_5 = fluid_1_5 || {};

(function ($, fluid) {

    /*******************************************************************************
     * CSSClassEnhancerBase
     *
     * Provides the map between the settings and css classes to be applied. 
     * Used as a UIEnhancer base grade that can be pulled in as requestd.
     *******************************************************************************/
    
    fluid.defaults("fluid.uiEnhancer.cssClassEnhancerBase", {
        gradeNames: ["fluid.littleComponent", "autoInit"],
        classnameMap: {
            "textFont": {
                "default": "",
                "times": "fl-font-uio-times",
                "comic": "fl-font-uio-comic-sans",
                "arial": "fl-font-uio-arial",
                "verdana": "fl-font-uio-verdana"
            },
            "theme": {
                "default": "fl-theme-uio-default",
                "bw": "fl-theme-uio-bw fl-theme-bw",
                "wb": "fl-theme-uio-wb fl-theme-wb",
                "by": "fl-theme-uio-by fl-theme-by",
                "yb": "fl-theme-uio-yb fl-theme-yb"
            },
            "links": "fl-link-enhanced",
            "inputsLarger": "fl-text-larger"
        }
    });

    /*******************************************************************************
     * BrowserTextEnhancerBase
     *
     * Provides the default font size translation between the strings and actual pixels. 
     * Used as a UIEnhancer base grade that can be pulled in as requestd.
     *******************************************************************************/
    
    fluid.defaults("fluid.uiEnhancer.browserTextEnhancerBase", {
        gradeNames: ["fluid.littleComponent", "autoInit"],
        fontSizeMap: {
            "xx-small": "9px",
            "x-small":  "11px",
            "small":    "13px",
            "medium":   "15px",
            "large":    "18px",
            "x-large":  "23px",
            "xx-large": "30px"
        }
    });

    /*******************************************************************************
     * UI Enhancer                                                                 *
     *                                                                             *
     * Works in conjunction with FSS to transform the page based on user settings. *
     *******************************************************************************/
    
    fluid.defaults("fluid.uiEnhancer", {
        gradeNames: ["fluid.viewComponent", "autoInit"],
        invokers: {
            updateModel: {
                funcName: "fluid.uiEnhancer.updateModel",
                args: ["{arguments}.0", "{uiEnhancer}.applier"]
            }
        },
        events: {
            onAsyncEnactorReady: null
        }
    });

    fluid.uiEnhancer.updateModel = function (newModel, applier) {
        applier.requestChange("", newModel);
    };

    /*******************************************************************************
     * UI Enhancer Starter Enactors
     *
     * A grade component for UIEnhancer. It is a collection of default UI Enhancer 
     * action ants.
     *******************************************************************************/
    
    fluid.defaults("fluid.uiEnhancer.starterEnactors", {
        gradeNames: ["fluid.uiEnhancer", "fluid.uiEnhancer.cssClassEnhancerBase", "fluid.uiEnhancer.browserTextEnhancerBase", "autoInit"],
        components: {
            textSize: {
                type: "fluid.uiOptions.enactors.textSize",
                container: "{uiEnhancer}.container",
                options: {
                    fontSizeMap: "{uiEnhancer}.options.fontSizeMap",
                    sourceApplier: "{uiEnhancer}.applier",
                    rules: {
                        "textSize": "value"
                    },
                    model: {
                        value: "{fluid.uiOptions.rootModel}.rootModel.textSize"
                    }
                }
            },
            textFont: {
                type: "fluid.uiOptions.enactors.classSwapper",
                container: "{uiEnhancer}.container",
                options: {
                    classes: "{uiEnhancer}.options.classnameMap.textFont",
                    sourceApplier: "{uiEnhancer}.applier",
                    rules: {
                        "textFont": "value"
                    },
                    model: {
                        value: "{fluid.uiOptions.rootModel}.rootModel.textFont"
                    }
                }
            },
            lineSpace: {
                type: "fluid.uiOptions.enactors.lineSpace",
                container: "{uiEnhancer}.container",
                options: {
                    fontSizeMap: "{uiEnhancer}.options.fontSizeMap",
                    sourceApplier: "{uiEnhancer}.applier",
                    rules: {
                        "lineSpace": "value"
                    },
                    model: {
                        value: "{fluid.uiOptions.rootModel}.rootModel.lineSpace"
                    }
                }
            },
            theme: {
                type: "fluid.uiOptions.enactors.classSwapper",
                container: "{uiEnhancer}.container",
                options: {
                    classes: "{uiEnhancer}.options.classnameMap.theme",
                    sourceApplier: "{uiEnhancer}.applier",
                    rules: {
                        "theme": "value"
                    },
                    model: {
                        value: "{fluid.uiOptions.rootModel}.rootModel.theme"
                    }
                }
            },
            emphasizeLinks: {
                type: "fluid.uiOptions.enactors.emphasizeLinks",
                container: "{uiEnhancer}.container",
                options: {
                    cssClass: "{uiEnhancer}.options.classnameMap.links",
                    sourceApplier: "{uiEnhancer}.applier",
                    rules: {
                        "links": "value"
                    },
                    model: {
                        links: "{fluid.uiOptions.rootModel}.rootModel.links"
                    }
                }
            },
            inputsLarger: {
                type: "fluid.uiOptions.enactors.inputsLarger",
                container: "{uiEnhancer}.container",
                options: {
                    cssClass: "{uiEnhancer}.options.classnameMap.inputsLarger",
                    sourceApplier: "{uiEnhancer}.applier",
                    rules: {
                        "inputsLarger": "value"
                    },
                    model: {
                        inputsLarger: "{fluid.uiOptions.rootModel}.rootModel.inputsLarger"
                    }
                }
            },
            tableOfContents: {
                type: "fluid.uiOptions.enactors.tableOfContents",
                container: "{uiEnhancer}.container",
                createOnEvent: "onCreateToc",
                options: {
                    tocTemplate: "{uiEnhancer}.options.tocTemplate",
                    sourceApplier: "{uiEnhancer}.applier",
                    rules: {
                        "toc": "value"
                    },
                    listeners: {
                        afterTocRender: "{uiEnhancer}.events.onAsyncEnactorReady",
                        onLateRefreshRelay: "{uiEnhancer}.events.onAsyncEnactorReady"
                    },
                    model: {
                        toc: "{fluid.uiOptions.rootModel}.rootModel.toc"
                    }
                }
            }
        },
        events: {
            onCreateToc: null
        },
        listeners: {
            onAsyncEnactorReady: [{
                listener: "{that}.emphasizeLinks.handleStyle",
                args: "{that}.model.links"
            }, {
                listener: "{that}.inputsLarger.handleStyle",
                args: "{that}.model.inputsLarger"
            }]
        },
        finalInitFunction: "fluid.uiEnhancer.starterEnactors.finalInit"
    });

    fluid.uiEnhancer.starterEnactors.finalInit = function (that) {
        $(document).ready(function () {
            that.events.onCreateToc.fire();
            
            // Directly calling toc apply function rather than firing a model change request
            // is because the modelRelay component prevents the relay on the unchanged value.
            that.tableOfContents.applyToc(that.model.toc);
        });
    };
    
    /*******************************************************************************
     * PageEnhancer                                                                *
     *                                                                             *
     * A UIEnhancer wrapper that concerns itself with the entire page.             *
     *******************************************************************************/
    fluid.pageEnhancer = function (uiEnhancerOptions) {
        var that = fluid.initLittleComponent("fluid.pageEnhancer");
        // This hack is required to resolve FLUID-4409 - much improved framework support is required
        that.options.originalUserOptions = fluid.copy(uiEnhancerOptions);
        that.uiEnhancerOptions = uiEnhancerOptions;
        fluid.initDependents(that);
        that.uiEnhancer.updateModel(that.getSettings());
        fluid.staticEnvironment.uiEnhancer = that.uiEnhancer;
        return that;
    };

    fluid.defaults("fluid.pageEnhancer", {
        gradeNames: ["fluid.originalEnhancerOptions", "fluid.uiOptions.rootModel", "fluid.uiOptions.settingsGetter"],
        components: {
            uiEnhancer: {
                type: "fluid.uiEnhancer",
                container: "body",
                options: "{pageEnhancer}.uiEnhancerOptions"
            }
        }
    });
    
    /*******************************************************************************
     * originalEnhancerOptions
     *
     * A grade component for pageEnhancer to keep track of the original user options
     *******************************************************************************/
    fluid.defaults("fluid.originalEnhancerOptions", {
        gradeNames: ["fluid.littleComponent", "autoInit"]
    });
    
    fluid.originalEnhancerOptions.preInit = function (that) {
        fluid.staticEnvironment.originalEnhancerOptions = that;
    };
    
})(jQuery, fluid_1_5);
/*
Copyright 2011 OCAD University
Copyright 2011 Lucendo Development Ltd.

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global fluid_1_5:true, jQuery, window*/

// JSLint options 
/*jslint white: true, funcinvoke: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

var fluid_1_5 = fluid_1_5 || {};

(function ($, fluid) {

    fluid.registerNamespace("fluid.dom");
    
    fluid.dom.getDocumentHeight = function (dokkument) {
        var body = $("body", dokkument)[0]; 
        return body.offsetHeight;
    };

    /*****************************************
     * Fat Panel UI Options Top Level Driver *
     *****************************************/

    fluid.defaults("fluid.uiOptions.fatPanel", {
        gradeNames: ["fluid.uiOptions.inline", "autoInit"],
        events: {
            afterRender: null,
            onReady: null
        },
        listeners: {
            onReady: {
                listener: "fluid.uiOptions.fatPanel.bindEvents",
                args: ["{fatPanel}.uiOptionsLoader.uiOptions", "{iframeRenderer}.iframeEnhancer", "{fatPanel}"]
            }
        },
        selectors: {
            reset: ".flc-uiOptions-reset",
            iframe: ".flc-uiOptions-iframe"
        },
        invokers: {
            bindReset: {
                funcName: "fluid.bind",
                args: ["{fatPanel}.dom.reset", "click", "{arguments}.0"]
            }
        },
        components: {
            pageEnhancer: "{uiEnhancer}",
            slidingPanel: {
                type: "fluid.slidingPanel",
                container: "{fatPanel}.container",
                options: {
                    invokers: {
                        operateShow: {
                            funcName: "fluid.uiOptions.fatPanel.showPanel"
                        },
                        operateHide: {
                            funcName: "fluid.uiOptions.fatPanel.hidePanel"
                        } 
                    }
                },
                createOnEvent: "afterRender"
            },
            iframeRenderer: {
                type: "fluid.uiOptions.fatPanel.renderIframe",
                container: "{fatPanel}.dom.iframe",
                options: {
                    markupProps: {
                        src: "%prefix/FatPanelUIOptionsFrame.html"
                    },
                    events: {
                        afterRender: "{fatPanel}.events.afterRender"
                    },
                    components: {
                        iframeEnhancer: {
                            type: "fluid.uiEnhancer",
                            container: "{iframeRenderer}.renderUIOContainer",
                            createOnEvent: "afterRender",
                            options: {
                                gradeNames: ["fluid.uiEnhancer.starterEnactors"],
                                jQuery: "{iframeRenderer}.jQuery",
                                tocTemplate: "{pageEnhancer}.options.tocTemplate",
                                events: {
                                    onIframeVisible: null
                                }
                            }
                        }
                    }
                }
            },
            uiOptionsLoader: {
                type: "fluid.uiOptions.fatPanelLoader"
            }
        },
        outerEnhancerOptions: "{originalEnhancerOptions}.options.originalUserOptions",
        distributeOptions: [{
            source: "{that}.options.slidingPanel.options",
            removeSource: true,
            target: "{that > slidingPanel}.options"
        }, {
            source: "{that}.options.iframeRenderer.options",
            removeSource: true,
            target: "{that > iframeRenderer}.options"
        }, {
            source: "{that}.options.iframe",
            removeSource: true,
            target: "{that}.options.selectors.iframe"
        }, {
            source: "{that}.options.outerEnhancerOptions",
            removeSource: true,
            target: "{that iframeEnhancer}.options"
        }, 
        {
            source: "{that}.options.prefix",
            target: "{that > iframeRenderer}.options.prefix"
        }]
    });
    
    /*****************************************
     * fluid.uiOptions.fatPanel.renderIframe *
     *****************************************/

    fluid.defaults("fluid.uiOptions.fatPanel.renderIframe", {
        gradeNames: ["fluid.viewComponent", "autoInit"],
        events: {
            afterRender: null
        },
        styles: {
            containerFlex: "fl-container-flex",
            container: "fl-uiOptions-fatPanel-iframe"
        },
        prefix: "./",
        markupProps: {
            "class": "flc-iframe",
            src: "%prefix/uiOptionsIframe.html"
        }
    });
    
    fluid.uiOptions.fatPanel.renderIframe.finalInit = function (that) {
        var styles = that.options.styles;
        // TODO: get earlier access to templateLoader, 
        that.options.markupProps.src = fluid.stringTemplate(that.options.markupProps.src, {"prefix/": that.options.prefix});
        that.iframeSrc = that.options.markupProps.src;
        
        // Create iframe and append to container
        that.iframe = $("<iframe/>");
        that.iframe.load(function () {
            var iframeWindow = that.iframe[0].contentWindow;
            that.iframeDocument = iframeWindow.document;

            that.jQuery = iframeWindow.jQuery;
            that.renderUIOContainer = that.jQuery("body", that.iframeDocument);
            that.jQuery(that.iframeDocument).ready(that.events.afterRender.fire);
        });
        that.iframe.attr(that.options.markupProps);
        
        that.iframe.addClass(styles.containerFlex);
        that.iframe.addClass(styles.container);
        that.iframe.hide();

        that.iframe.appendTo(that.container);
    };

    fluid.uiOptions.fatPanel.updateView = function (uiOptions) {
        uiOptions.events.onUIOptionsRefresh.fire();
        uiOptions.events.onSignificantDOMChange.fire();
    };
    
    fluid.uiOptions.fatPanel.bindEvents = function (uiOptions, iframeEnhancer, fatPanel) {
        // TODO: This binding should be done declaratively - needs ginger world in order to bind onto slidingPanel
        // which is a child of this component - and also uiOptionsLoader which is another child
        fatPanel.slidingPanel.events.afterPanelShow.addListener(function () {
            iframeEnhancer.events.onIframeVisible.fire(iframeEnhancer);
            fluid.uiOptions.fatPanel.updateView(uiOptions);
        });  
    
        uiOptions.events.onUIOptionsRefresh.addListener(function () {
            iframeEnhancer.updateModel(uiOptions.model.selections);
        });
        uiOptions.events.onReset.addListener(function (uiOptions) {
            fluid.uiOptions.fatPanel.updateView(uiOptions);
        });
        uiOptions.events.onSignificantDOMChange.addListener(function () {
            var dokkument = uiOptions.container[0].ownerDocument;
            var height = fluid.dom.getDocumentHeight(dokkument);
            var iframe = fatPanel.iframeRenderer.iframe;
            var attrs = {height: height + 15}; // TODO: Configurable padding here
            var panel = fatPanel.slidingPanel.locate("panel");
            panel.css({height: ""});
            iframe.animate(attrs, 400);
        });
        
        // Re-apply text size and line space to iframe content since these initial css values are not detectable
        // when the iframe is hidden.
        iframeEnhancer.events.onIframeVisible.addListener(function () {
            iframeEnhancer.textSize.set(iframeEnhancer.model.textSize);
            iframeEnhancer.lineSpace.set(iframeEnhancer.model.lineSpace);
        });

        fatPanel.slidingPanel.events.afterPanelHide.addListener(function () {
            fatPanel.iframeRenderer.iframe.height(0);
            
            // Prevent the hidden UIO panel from being keyboard and screen reader accessible
            fatPanel.iframeRenderer.iframe.hide();
        });
        fatPanel.slidingPanel.events.onPanelShow.addListener(function () {
            fatPanel.iframeRenderer.iframe.show();
        });
    };

    // Replace the standard animator since we don't want the panel to become hidden
    // (potential cause of jumping)
    fluid.uiOptions.fatPanel.hidePanel = function (panel, callback) {
        $(panel).animate({height: 0}, {duration: 400, complete: callback});
    };
    
    // no activity - the kickback to the updateView listener will automatically trigger the
    // DOMChangeListener above. This ordering is preferable to avoid causing the animation to
    // jump by refreshing the view inside the iframe
    fluid.uiOptions.fatPanel.showPanel = function (panel, callback) {
        // A bizarre race condition has emerged under FF where the iframe held within the panel does not
        // react synchronously to being shown
        setTimeout(callback, 1);
    };
    
    /*************************************************************
     * fluid.uiOptions.fatPanelLoader: 
     * 
     * Define the loader that are specifically for the fat panel.
     *************************************************************/
    fluid.defaults("fluid.uiOptions.fatPanelLoader", {
        gradeNames: ["fluid.uiOptions.loader", "autoInit"],
        components: {
            uiOptions: {
                createOnEvent: "templatesAndIframeReady",
                container: "{iframeRenderer}.renderUIOContainer",
                options: {
                    gradeNames: ["fluid.uiOptions.uiEnhancerRelay"],
                    // ensure that model and applier are available to users at top level
                    model: "{fatPanel}.model",
                    applier: "{fatPanel}.applier",
                    events: {
                        onSignificantDOMChange: null,
                        updateEnhancerModel: "{that}.events.modelChanged"
                    },
                    listeners: {
                        modelChanged: "{that}.save",
                        onCreate: {
                            listener: "{fatPanel}.bindReset",
                            args: ["{that}.reset"]
                        }
                    },
                    components: {
                        iframeRenderer: "{fatPanel}.iframeRenderer"
                    }
                }
            }
        },
        events: {
            templatesAndIframeReady: {
                events: {
                    iframeReady: "{fatPanel}.events.afterRender",
                    templateReady: "onUIOptionsTemplateReady"
                }
            },
            onReady: "{fatPanel}.events.onReady"
        }
    });

})(jQuery, fluid_1_5);/*
Copyright 2011 OCAD University
Copyright 2011 Lucendo Development Ltd.

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global fluid_1_5:true, jQuery*/

// JSLint options 
/*jslint white: true, funcinvoke: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

var fluid_1_5 = fluid_1_5 || {};

(function ($, fluid) {
    /******************************
     * Full No Preview UI Options *
     ******************************/

    fluid.defaults("fluid.uiOptions.fullNoPreview", {
        gradeNames: ["fluid.uiOptions.inline", "autoInit"],
        container: "{fullNoPreview}.container",
        templateLoader: {
            options: {
                templates: {
                    uiOptions: "%prefix/FullNoPreviewUIOptions.html"
                }
            }
        },
        uiOptions: {
            options: {
                listeners: {
                    onReset: function (uiOptions) {
                        uiOptions.save();
                    }
                }
            }
        }
    });
    
})(jQuery, fluid_1_5);/*
Copyright 2011 OCAD University
Copyright 2011 Lucendo Development Ltd.

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global fluid_1_5:true, jQuery*/

// JSLint options 
/*jslint white: true, funcinvoke: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

var fluid_1_5 = fluid_1_5 || {};

(function ($, fluid) {
    /***************************
     * Full Preview UI Options *
     ***************************/

    fluid.defaults("fluid.uiOptions.fullPreview", {
        gradeNames: ["fluid.uiOptions.inline", "autoInit"],
        container: "{fullPreview}.container",
        outerPreviewEnhancerOptions: "{originalEnhancerOptions}.options.originalUserOptions",
        templateLoader: {
            options: {
                templates: {
                    uiOptions: "%prefix/FullPreviewUIOptions.html"
                }
            }
        },
        uiOptions: {
            options: {
                components: {
                    preview: {
                        type: "fluid.uiOptions.preview",
                        createOnEvent: "onUIOptionsComponentReady",
                        container: "{uiOptions}.dom.previewFrame"
                    }
                }
            }
        },
        distributeOptions: [{
            source: "{that}.options.outerPreviewEnhancerOptions",
            removeSource: true,
            target: "{that enhancer}.options"
        }, {
            source: "{that}.options.preview.options",
            target: "{that preview}.options"
        }, {
            source: "{that}.options.previewEnhancer.options",
            removeSource: true,
            target: "{that enhancer}.options"
        }]
    });
    
})(jQuery, fluid_1_5);/*
Copyright 2011 OCAD University
Copyright 2011 Lucendo Development Ltd.

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global fluid_1_5:true, jQuery*/

// JSLint options 
/*jslint white: true, funcinvoke: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

var fluid_1_5 = fluid_1_5 || {};

(function ($, fluid) {
    /**********************
     * Sliding Panel *
     *********************/
     
    fluid.defaults("fluid.slidingPanel", {
        gradeNames: ["fluid.viewComponent", "autoInit"],             
        selectors: {
            panel: ".flc-slidingPanel-panel",
            toggleButton: ".flc-slidingPanel-toggleButton"
        },
        strings: {
            showText: "{uioMsgBundle}.options.messageBase.slidingPanelShowText",
            hideText: "{uioMsgBundle}.options.messageBase.slidingPanelHideText"            
        },          
        events: {
            onPanelHide: null,
            onPanelShow: null,
            afterPanelHide: null,
            afterPanelShow: null
        },
        finalInitFunction: "fluid.slidingPanel.finalInit",
        invokers: {
            operateHide: "fluid.slidingPanel.slideUp",
            operateShow: "fluid.slidingPanel.slideDown"
        },
        model: {
            isShowing: false
        },
        methods: {
            showPanel: {
                finalState: true,
                name: "Show"
            },
            hidePanel: {
                finalState: false,
                name: "Hide"
            }
        }
    });
    
    fluid.slidingPanel.slideUp = function (element, callback, duration) {
        $(element).slideUp(duration || "400", callback);
    };
    
    fluid.slidingPanel.slideDown = function (element, callback, duration) {
        $(element).slideDown(duration || "400", callback);
    };
    
    fluid.slidingPanel.finalInit = function (that) {
        fluid.each(that.options.methods, function (method, methodName) {
            that[methodName] = function () {
                that.events["onPanel" + method.name].fire(that);
                that.applier.requestChange("isShowing", method.finalState);
                that.refreshView();
                that["operate" + method.name](that.locate("panel"), that.events["afterPanel" + method.name].fire);
            };
        });
        
        that.togglePanel = function () {
            that[that.model.isShowing ? "hidePanel" : "showPanel"]();
        };
        
        that.setPanelHeight = function (newHeight) {
            that.locate("panel").height(newHeight);
        };
        
        that.refreshView = function () {
            that.locate("toggleButton").text(that.options.strings[that.model.isShowing ? "hideText" : "showText"]);         
        };
    
        that.locate("toggleButton").click(that.togglePanel);        
        
        that.refreshView();
    };    

})(jQuery, fluid_1_5);
