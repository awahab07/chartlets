/*
  Chartlets v0.9.10: http://chartlets.com
  MIT License
  (c) 2013 Adam Mark
*/
(function (win) {
  var Chartlets, type, ctx, width, height, rotated, range, sets, opts, colors, themes, renderers, animate;
  // Type of chart ("line", "bar" or "pie")
  type = null;

  // Canvas 2d context
  ctx = null;

  // Canvas dimensions
  width = 0;
  height = 0;

  // Is the canvas rotated 90 degrees (for horizontal bar charts)?
  rotated = false;

  // Input range [min, max] across sets
  range = [0, 0];

  // Data sets (an array of arrays)
  sets = [];

  // Options from data-opts
  opts = {};

  // Renderers for line, bar and pie charts
  renderers = {
    "line": renderLineChart,
    "bar": renderBarChart,
    "pie": renderPieChart,
    "barline": renderBarLineChart,
    "scatter": renderScatterChart,
    "gauge": renderGaugeChart
  };

  // Built-in color themes. A theme can have any number of colors (as hex, RGB/A, or HSL/A)
  themes = {
    "blues":  ["#7eb5d6", "#2a75a9", "#214b6b", "#dfc184", "#8f6048"],
    "money":  ["#009b6d", "#89d168", "#d3eb87", "#666666", "#aaaaaa"],
    "circus": ["#9351a4", "#ff99cc", "#e31a1c", "#66cdaa", "#ffcc33"],
    "party":  ["#ffcc00", "#ff66cc", "#3375cd", "#e43b3b", "#96cb3f"],
    "garden": ["#3c7bb0", "#ffa07a", "#2e8b57", "#7eb5d6", "#89d168"],
    "crayon": ["#468ff0", "#ff8000", "#00c000", "#ffd700", "#ff4500"],
    "ocean":  ["#3375cd", "#62ccb2", "#4aa5d5", "#a6cee3", "#ffcc33"],
    "spring": ["#ed729d", "#72caed", "#9e9ac8", "#a6d854", "#f4a582"],
    "beach":  ["#f92830", "#2fb4b1", "#ffa839", "#3375cd", "#5fd1d5"],
    "fire":   ["#dc143c", "#ff8c00", "#ffcc33", "#b22222", "#cd8540"]
  };

  // Animation shim. See http://paulirish.com/2011/requestanimationframe-for-smart-animating/
  animate =
    win.requestAnimationFrame || 
    win.webkitRequestAnimationFrame ||
    win.mozRequestAnimationFrame ||
    win.msRequestAnimationFrame ||
    function (callback) {
      win.setTimeout(callback, 1000 / 60);
    };

  // Split attribute value into array. "a b c" -> ["a", "b", "c"]
  function parseAttr(elem, attr) {
    var val = elem.getAttribute(attr);

    return val ? val.replace(/, +/g, ",").split(/ +/g) : null;
  }

  // Accounting for string and single quoted string literals containing space
  function parseAttrWithStrings(elem, attr) {
    var val = elem.getAttribute(attr);
    var regexToExtractOption = /([\w]*?:'(?:[^\\"\']+|\\.)*')|([\w]*?:[-\d\S\.]+)/g;
    return val ?  val.match(regexToExtractOption): null;
  }

  // Parse data-opts attribute. "a:b c:d" -> {a:"b", c:"d"}
  function parseOpts(elem) {
    var pairs, pair, opts, i;

    pairs = parseAttr(elem, "data-opts") || [];
    opts = {};

    for (i = 0; i < pairs.length; i++) {
      pair = pairs[i].split(":");
      opts[pair[0]] = pair[1];
    }

    return opts;
  }

  // Parse options from parsed attribute data-opts attribute. "a:b c:d" -> {a:"b", c:"d"}
  function parseOptsPairs(pairs) {
    var pair, opts, i;
    opts = {};

    for (i = 0; i < pairs.length; i++) {
      pair = pairs[i].split(":");
      opts[pair[0]] = pair[1];
    }

    return opts;
  }  

  // Parse options JSON. ["a:10", "b:'Very Good'"] -> {a:10, b:'Very Good'}
  function parseOptsWithStrings(elem, attr) {
    var opts = parseAttrWithStrings(elem, attr);
    
    if(opts) {
      var pair, optsObj, i;
      optsObj = {};

      for (i = 0; i < opts.length; i++) {
        pair = opts[i].split(":");
        optsObj[pair[0]] = isNaN(pair[1]) ? stripSingleQuotes(pair[1]) : +pair[1];
      }

      return optsObj;
    }
    
    return opts;
  }

  // Parse data-sets attribute. "[1 2] [3 4]" -> [[1,2], [3,4]]
  function parseSets(str) {
    // or "[[1,2], [3,4]]" -> [[1,2], [3,4]]
    var sets = str.match(/\[[^\[]+\]/g) || [], i, j;

    for (i = 0; i < sets.length; i++) {
      sets[i] = sets[i].match(/[-\d\.]+/g);

      for (j = 0; j < sets[i].length; j++) {
        sets[i][j] = +sets[i][j];
      }
    }

    return sets;
  }

  // Parse data-sets attribute taking account single quoted string literals. "[1 2 'Good'] [3 4 'Very Good']" -> [[1,2,"Good"], [3,4,"Very Good"]]
  function parseSetsWithStrings(str) {
    var sets = str.match(/\[[^\[]+\]/g) || [], i, j;

    for (i = 0; i < sets.length; i++) {
      // Splitting apart numbers/strings from dataset string 
      sets[i] = sets[i].match(/('(?:[^\\"\']+|\\.)*')|([-\w\.]+)/g);

      for (j = 0; j < sets[i].length; j++) {
        sets[i][j] = isNaN(sets[i][j]) ? stripSingleQuotes(sets[i][j]) : +sets[i][j];
      }
    }

    return sets;
  }

  // Stripping single quotes around the string if present
  function stripSingleQuotes(str) {
    if(str[0] == "'" && str[str.length-1] == "'") {
      return str.substring(1, str.length-1);
    }
    return str;
  }

  // Is the bar or line chart stacked?
  function isStacked() {
    return opts.transform === "stack";
  }

  // Is the line chart filled?
  function isFilled() {
    return opts.fill !== undefined;
  }

  // Get the range [min, max] across all data sets
  function getRange(sets, stacked) {
    return stacked ? computeStackRange(sets) : computeRange(sets);
  }

  // Compute the range [min, max] across all data sets
  function computeRange(sets) {
    var arr = Array.prototype.concat.apply([], sets);

    if (type === "bar" || isStacked()) {
      arr.push(0);
    }

    return [Math.min.apply(null, arr), Math.max.apply(null, arr)];
  }

  // Compute the range [min, max] across all data sets if they are *stacked*
  function computeStackRange(sets) {
    return computeRange(mergeSets(sets).concat(sets));
  }

  // Convert a color string (hex, rgb/a, or hsl/a) to an object with r, g, b, a values
  function parseColor(str) {
    var color = {
      "r": 0,
      "g": 0,
      "b": 0,
      "a": 1
    };
 
    if (str.match(/#/)) {
      color = parseHex(str);
    }
    else if (str.match(/rgb/)) {
      color = parseRGB(str);
    }
    else if (str.match(/hsl/)) {
      color = parseHSL(str);
    }

    return color;
  }

  // Convert an rgb or rgba string to an object with r, g, b, a values
  function parseRGB(str) {
    var c = str.match(/[\d\.]+/g);

    return {
      "r": +c[0],
      "g": +c[1],
      "b": +c[2],
      "a": +c[3] || 1
    };
  }

  // Convert a 3- or 6-digit hex string to an object with r, g, b, a values
  function parseHex(str) {
    var c = str.match(/\w/g), n;

    if (c.length === 3) {
      c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    }

    n = +("0x" + c.join(""));

    return {
      "r": (n & 0xFF0000) >> 16,
      "g": (n & 0x00FF00) >> 8,
      "b": (n & 0x0000FF),
      "a": 1
    };
  }

  // Convert an hsl or hsla string to an object with r, g, b, a values
  // See http://stackoverflow.com/questions/2353211/hsl-to-rgb-color-conversion
  function parseHSL(str) {
    var c, h, s, l, r, g, b, q, p, a;

    c = str.match(/[\d\.]+/g);
    h = +c[0] / 360;
    s = +c[1] / 100;
    l = +c[2] / 100;
    a = (+c[3] || 1) / 1;

    function hue2rgb(p, q, t) {
      if (t < 0) {
        t += 1;
      }
      if (t > 1) {
        t -= 1;
      }
      if (t < 1 / 6) {
        return p + (q - p) * 6 * t;
      }
      if (t < 1 / 2) {
        return q;
      }
      if (t < 2 / 3) {
        return p + (q - p) * (2 / 3 - t) * 6;
      }

      return p;
    }

    if (s === 0) {
      r = g = b = l;
    } else {
      q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }

    return {
      "r": r * 255,
      "g": g * 255,
      "b": b * 255,
      "a": a
    };
  }

  // Mixing colors based on provided ratio
  function mixColor(startColor, endColor, ratio) {
    return {
      r: ((1-ratio) * startColor.r) + (ratio * endColor.r),
      g: ((1-ratio) * startColor.g) + (ratio * endColor.g),
      b: ((1-ratio) * startColor.b) + (ratio * endColor.b),
      a: ratio >= 0.5 ? endColor.a : startColor.a
    };
  }

  // Multiply a color's alpha value (0 to 1) by n
  function sheerColor(color, n) {
    color.a *= n;

    return color;
  }

  // Convert a color object (with r, g, b, a properties) to an rgba string
  function toRGBString(color) {
    return "rgba(" + [
      Math.round(color.r),
      Math.round(color.g),
      Math.round(color.b),
      color.a
    ].join(",") + ")";
  }

  // Rotate the context 90 degrees
  function rotate() {
    rotated = true;
    ctx.translate(width, 0);
    ctx.rotate(Math.PI / 2);    
  }

  // Get the x step in pixels
  function getXStep(len) {
    return (rotated ? height : width) / (len - 1);
  }

  // Get the x position in pixels for the given index and length of set
  function getXForIndex(idx, len) {
    return idx * getXStep(len);
  }

  // Get the y position in pixels for the given data value
  function getYForValue(val) {
    var h = rotated ? width : height;

    return h - (h * ((val - range[0]) / (range[1] - range[0])));
  }

  // Get the x position in pixels for the given data value and range
  function getXForValueAndRange(val, range) {
    var w = rotated ? height : width;
  
    return (w * ((val - range[0]) / (range[1] - range[0])));
  }

  // Get the y position in pixels for the given data value and range
  // Also it iverts the calculated value as y increases downwards which is contradictory to that of cartesian system
  function getYForValueAndRange(val, range) {
    var h = rotated ? width : height;

    return h - (h * ((val - range[0]) / (range[1] - range[0])));
  }

  // Get the z/size/third dimension in pixels for the given data value and ranges
  // Maps/adjusts the size of z/size axis to width or height, whichever is greater
  function getZForValueAndRange(val, range) {
    var d = width > height ? width : height;

    return ( d / 10 * val / range[1] );
  }

  function getSignedSetIndices(sets, j, s) {
    var positiveSetIndecies = [];
    var negativeSetIndecies = [];

    for(i=0; i<sets.length; i++) {
      if(sets[i][j] >= 0) {
        positiveSetIndecies.push(i);
      }else{
        negativeSetIndecies.push(i);
      }
    }
    
    if('undefined' == typeof s || s == 'positive') {
      return positiveSetIndecies;
    }else {
      return negativeSetIndecies;
    }
  }

  // Sum all the values in a set. e.g. sumSet([1,2,3]) -> 6
  function sumSet(set) {
    var i, n = 0;

    for (i = 0; i < set.length; i++) {
      n += set[i];
    }

    return n;
  }

  // Sum all the values at the given index across sets. e.g. sumY([[4,5],[6,7]], 0) -> 10
  function sumY(sets, idx) {
    var i, n = 0;

    for (i = 0; i < sets.length; i++) {
      n += sets[i][idx];
    }

    return n;
  }

  // Sum all the values at the given index across sets with positive and negative rows separated
  // Returns sum of column j values from start to ith row from rows of given sign.
  function sumYSigned(sets, i, j) {
    var signedSetIndices = getSignedSetIndices(sets, j, sets[i][j] >= 0 ? 'positive' : 'negative');
    var sIndex, sum = 0;
    for(sIndex = 0; sIndex < signedSetIndices.length; sIndex++) {
      if(signedSetIndices[sIndex] <= i){
        sum += sets[signedSetIndices[sIndex]][j];
      }
    }
    return sum;
  }

  // Merge two or more sets into one array. e.g. mergeSets([[1,2],[3,4]]) -> [4,6]
  function mergeSets(sets) {
    var i, set = [];

    for (i = 0; i < sets[0].length; i++) {
      set.push(sumY(sets, i));
    }

    return set;
  }

  // Get the color string for the given index. Return black if undefined
  function colorOf(idx) {
    return colors[idx] || "#000";
  }

  // Draw a line (or polygon) for a data set
  function drawLineForSet(set, strokeStyle, lineWidth, fillStyle, offset) {
    var i = 0, x, y, step;
    
    step = getXStep(set.length);

    ctx.lineWidth = Math.min(3, lineWidth);
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.strokeStyle = strokeStyle;
    ctx.moveTo(0, getYForValue(set[0]));

    while (++i < set.length) {
      x = getXForIndex(i, set.length);
      y = getYForValue(set[i]);

      // TODO support stack + smooth
      if (isStacked()) {
        opts.shape = "straight";
      }

      drawLineSegment(set, i, x, y, step, opts.shape);
    }

    // TODO support transform=band (upper + lower baselines)
    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      if (offset) {
        while (--i >= 0) {
          x = getXForIndex(i, offset.length);
          y = getYForValue(offset[i]);

          drawLineSegment(offset, i, x, y, step, opts.shape);
          //ctx.lineTo(x, y);
        }
      }
      else {
        ctx.lineTo(x, getYForValue(0));
        ctx.lineTo(0, getYForValue(0));
      }
      ctx.fill();
    }
    else {
      ctx.stroke();
    }
  }

  // Draw an individual line segment
  function drawLineSegment(set, i, x, y, step, shape) {
    var cx, cy;

    // curvy line
    if (shape === "smooth") {
      cx = getXForIndex(i - 0.5, set.length);
      cy = getYForValue(set[i - 1]);
      ctx.bezierCurveTo(cx, cy, cx, y, x, y);
    }
    else {
      // stepped line
      if (shape === "step") {
        ctx.lineTo(x - (step / 2), getYForValue(set[i - 1]));
        ctx.lineTo(x - (step / 2), y);
      }
      // else straight line
      ctx.lineTo(x, y);
    }
  }

  // Draw circle or square caps for a data set
  function drawCapsForSet(set, capStyle, fillStyle, lineWidth) {
    var i = -1, x, y, w;

    while (++i < set.length) {
      x = getXForIndex(i, set.length);
      y = getYForValue(set[i]);

      if (capStyle === "square") {
        w = Math.max(2, lineWidth) * 2.5;
        drawRect(fillStyle, x - (w / 2), y + (w / 2), w, w);
      }
      else {
        w = lineWidth + 1;
        drawCircle(fillStyle, x, y, w);
      }
    }
  }

  // Draw a circle
  function drawCircle(fillStyle, x, y, r) {
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.arc(x, y, r, 2 * Math.PI, false);
    ctx.fill();
  }

  // Draw a rectangle from bottom left corner
  function drawRect(fillStyle, x, y, w, h) {
    ctx.fillStyle = fillStyle;
    ctx.fillRect(x, y - h, w, h);
  }

  // Draw an axis if a y-value is provided in data-opts
  function drawAxis() {
    var x, y;

    if (!isNaN(+opts.axis)) {
      x = 0;
      y = Math.round(getYForValue(opts.axis));

      ctx.lineWidth = 1;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#bbb";
      ctx.moveTo(x, y);

      while (x < width) {
        ctx.lineTo(x + 5, y);
        ctx.moveTo(x + 8, y);
        x += 8;
      }

      ctx.stroke();
    }
  }

  // Draw a X or Y axis at given v position, the value "v" should be normalized i.e. with getYForValue or getVForValue operation applied
  function drawXYAxisAt(v, axis) {
    if('undefined' == typeof axis)
      axis = 'x';
    
    var start, end;
    end = axis == 'y' ? width : height;

    if (!isNaN(+v)) {
      start = 0;
      v = Math.round(v);

      ctx.lineWidth = 1;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#bbb";

      if(axis == 'x')
        ctx.moveTo(start, v);
      else
        ctx.moveTo(v, start);

      while (start < end) {
        if(axis == 'x') {
          ctx.lineTo(start + 5, v);
          ctx.moveTo(start + 8, v);
        }else {
          ctx.lineTo(v, start + 5);
          ctx.moveTo(v, start + 8);
        }
        
        start += 8;
      }

      ctx.stroke();
    }
  }

  function drawAxisForRanges(xAxisRange, yAxisRange) {
    if('undefined' == typeof xAxisRange || 'undefined' == typeof yAxisRange) {
      console.error('Range parameters for function "drawAxisForRanges" not provided');
    }

    // Drawing Axis if provided either explicitly for x or y or combinely for both
    if(!isNaN(+opts.xAxis) || !isNaN(+opts.yAxis)) {
      if(!isNaN(+opts.xAxis)) {
        drawXYAxisAt(getXForValueAndRange(+opts.xAxis, xAxisRange), 'x');
      }

      if(!isNaN(+opts.yAxis)) {
        drawXYAxisAt(getYForValueAndRange(+opts.yAxis, yAxisRange), 'y');
      }
    } else if(!isNaN(+opts.axis)) {
      // Drawing both axis
      drawXYAxisAt(getXForValueAndRange(+opts.axis, xAxisRange), 'x');
      drawXYAxisAt(getYForValueAndRange(+opts.axis, yAxisRange), 'y');
    }
  }

  // Draws text along arc of given center and radius
  function drawTextAlongArc(context, str, centerX, centerY, radius, angle) {
    var len = str.length, s;
    context.save();
    context.translate(centerX, centerY);
    context.rotate(-1 * angle / 2);
    context.rotate(-1 * (angle / len) / 2);
    for(var n = 0; n < len; n++) {
      context.rotate(angle / len);
      context.save();
      context.translate(0, -1 * radius);
      s = str[n];
      context.fillText(s, 0, 0);
      context.restore();
    }
    context.restore();
  }

    // Calculates and returns point object based on given values
  function getPointOnCircle(center, radius, angle, offset) {
    return {
      x: (center.h - radius) + ( radius - (Math.cos(angle) * radius * offset) ),
      y: (center.k - radius) + ( radius - (Math.sin(angle) * radius * offset) )
    }
  }

  // Draws calibration for gauge chart speedometer for given parameters, draws major, minor ticks and values
  function drawCalibration(ctx, center, radius, angle, start, end, value, style, lineWidth, font) {
        var toPoint = getPointOnCircle(center, radius, angle, start); // Point towards outer arc

        if(value === 'tick') {
          var fromPoint = getPointOnCircle(center, radius, angle, end); // Point towards center
          // Plotting ticks
          ctx.beginPath();
          ctx.lineWidth = lineWidth;
          ctx.fillStyle = style;
          ctx.strokeStyle = style;
          ctx.moveTo(fromPoint.x, fromPoint.y);
          ctx.lineTo(toPoint.x, toPoint.y);
          ctx.stroke();
          ctx.closePath();
        } else {
          // Drawing calibration text
          ctx.font = font;
          ctx.fillStyle = style;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(value, toPoint.x, toPoint.y);
        }
  }

  // Fill a circle sector
  function drawFilledArc(ctx, center, outerRadius, innerRadius, startAngel, endAngle, style) {
    ctx.beginPath();
    ctx.arc(center.h, center.k, outerRadius, startAngel, endAngle, false);
    ctx.arc(center.h, center.k, innerRadius, endAngle, startAngel, true);
    ctx.fillStyle = style;
    ctx.fill();
    ctx.closePath();
  }

  // Interpolate a value between a and b. e.g. interpolate(0,1,5,10) -> 0.5
  function interpolate(a, b, idx, steps) {
    return +a + ((+b - +a) * (idx / steps));
  }

  // Interpolate all values from set a to set b, returning an array of arrays
  function interpolateSet(a, b, n) {
    var i, j, c = [a];

    for (i = 0; i < a.length; i++) {
      for (j = 1; j < n; j++) {
        if (!c[j]) {
          c[j] = [];
        }

        c[j][i] = interpolate(a[i], b[i], j, n);
      }
    }

    return c.concat([b]);
  }

  // Interpolate all values across two arrays of sets, returning a multidimensional array
  function interpolateSets(a, b, n) {
    var i, c = [];

    for (i = 0; i < a.length; i++) {
      c.push(interpolateSet(a[i], b[i], n));
    }

    return c;
  }

  // Create a transition from one array of sets to another for the element with the given ID
  function Transition(elem, asets, bsets) {
    var i = 1, j = 0, n = 8, interpolated = interpolateSets(asets, bsets, n);

    if (!asets.length) {
      return Chartlets.update(elem, bsets);
    }

    function _render() {
      var set = [];

      for (j = 0; j < interpolated.length; j++) {
        set.push(interpolated[j][i]);
      }

      Chartlets.update(elem, set);

      if (++i <= n) {
        animate(_render);
      }
    }

    animate(_render);
  }

  // Render a line chart
  function renderLineChart() {
    var i, set, strokeStyle, fillStyle, alphaMultiplier, offset;

    drawAxis();

    for (i = 0; i < sets.length; i++) {
      set = sets[i];
      strokeStyle = colorOf(i);

      if (isStacked()) {
        set = mergeSets(sets.slice(0, i + 1));
        offset = i > 0 ? mergeSets(sets.slice(0, i)) : null;
      }

      
      drawLineForSet(set, strokeStyle, opts.stroke || 1.5, null, offset);

      // TODO account for negative and positive values in same stack
      if (isStacked() || isFilled()) {
        alphaMultiplier = opts.alpha || (isStacked() ? 1 : 0.5);

        fillStyle = toRGBString(sheerColor(parseColor(strokeStyle), alphaMultiplier));

        drawLineForSet(set, strokeStyle, 0, fillStyle, offset);
      }

      if (opts.cap) {
        drawCapsForSet(set, opts.cap, strokeStyle, ctx.lineWidth);
      }
    }
  }

  // Render a bar chart
  function renderBarChart() {
    var i, j, p, a, x, y, w, h, len;

    if (opts.orient === "horiz") {
      rotate();
    }

    drawAxis();

    ctx.lineWidth = opts.stroke || 1;
    ctx.lineJoin = "miter";

    len = sets[0].length;

    // TODO fix right pad
    for (i = 0; i < sets.length; i++) {
      for (j = 0; j < len; j++) {
        p = 1;
        a = rotated ? height : width;
        w = ((a / len) / sets.length) - ((p / sets.length) * i) - 1;
        x = (p / 2) + getXForIndex(j, len + 1) + (w * i) + 1;
        y = getYForValue(sets[i][j]);
        h = y - getYForValue(0) || !isNaN(opts.mapZeroValueTo) && +opts.mapZeroValueTo || 0;

        if (isStacked()) {
          // TODO account for negative and positive values in same stack
          w = (a / len) - 2;
          x = getXForIndex(j, len + 1);
          //y = getYForValue(sumY(sets.slice(0, i + 1), j));
          
          // Accounting for negative and positive values in same stack
          y = getYForValue(sumYSigned(sets, i, j));
        }

        drawRect(colorOf(i), x, y, w, h);
      }
    }
  }

  // Render a bar line chart, reusing the default renderers
  function renderBarLineChart() {
    var elem = ctx.canvas;
    
    // Retrieving and calculating height ratio of Line Chart to the Bar Chart
    var heightRatio = parseFloat(elem.getAttribute("data-height-ratio") || 1);
    var heightProportions = height / (heightRatio + 1);
    height = Math.round(heightProportions * heightRatio);
    var barChartHeight = Math.round(heightProportions);

    var defaultOpts = parseOptsWithStrings(elem, "data-opts") || {};
    
    // Line Chart Definition Override's
    sets = elem.getAttribute("data-line-sets") !== null ? parseSets(elem.getAttribute("data-line-sets")) : sets;
    opts = parseAttr(elem, "data-line-opts") !== null ? parseOptsPairs(parseAttr(elem, "data-line-opts") || []) : opts;
    colors = themes[opts.theme] || parseAttr(elem, "data-line-colors") || parseAttr(elem, "data-colors") || themes[defaultOpts.theme] || themes.basic;
    range = parseAttr(elem, "data-line-range") || parseAttr(elem, "data-range") || getRange(sets, isStacked());
    rotated = false;
    
    renderLineChart();
    
    // Drawing separator, line chart portion
    if(defaultOpts.separator && defaultOpts.separator || false)
      drawRect(defaultOpts.separatorStyle || '#000', 0, height, width, defaultOpts.separatorWidth && defaultOpts.separatorWidth/2 || 0.5);

    // Requesting separate context for Bar Portion
    ctx = ctx.canvas.getContext("2d");
    ctx.translate(0, height);
    
    height = barChartHeight;

    // Line Chart Definition Override's
    sets = elem.getAttribute("data-bar-sets") !== null ? parseSets(elem.getAttribute("data-bar-sets")) : parseSets(elem.getAttribute("data-sets"));
    opts = parseAttr(elem, "data-bar-opts") !== null ? parseOptsPairs(parseAttr(elem, "data-bar-opts") || []) : parseOpts(elem);
    colors = themes[opts.theme] || parseAttr(elem, "data-bar-colors") || parseAttr(elem, "data-colors") || themes[defaultOpts.theme] || themes.basic;
    range = parseAttr(elem, "data-bar-range") || parseAttr(elem, "data-range") || getRange(sets, isStacked());
    rotated = false;

    renderBarChart();

    // Drawing separator, line chart portion
    if(defaultOpts.separator && defaultOpts.separator || false)
      drawRect(defaultOpts.separatorStyle || '#000', 0, defaultOpts.separatorWidth && defaultOpts.separatorWidth/2 || 0.5, width, defaultOpts.separatorWidth && defaultOpts.separatorWidth/2);
  }

  // Render a pie chart
  function renderPieChart() {
    var i, x, y, r, a1, a2, set, sum;

    x = width / 2;
    y = height / 2;
    r = Math.min(x, y) - 2;
    a1 = 1.5 * Math.PI;
    a2 = 0;
    set = sets[0];
    sum = sumSet(set);

    for (i = 0; i < set.length; i++) {
      ctx.fillStyle = colorOf(i);
      ctx.beginPath();
      a2 = a1 + (set[i] / sum) * (2 * Math.PI);

      // TODO opts.wedge
      ctx.arc(x, y, r, a1, a2, false);
      ctx.lineTo(x, y);
      ctx.fill();
      a1 = a2;
    }
  }

  // Render a x-y scatter chart
  // Bubble chart is plotted via the x-y scatter chart option if bubbles:true present in options
  function renderScatterChart() {
    var i, colorRange, xSets, ySets, xAxisRange, yAxisRange, zAxisRange, textOpts, textStrokeOpts, elem = ctx.canvas;
    
    // Retrieving sets with string literals
    sets = elem.getAttribute("data-sets") !== null ? parseSetsWithStrings(elem.getAttribute("data-sets")) : null;

    colorRange = parseAttr(elem, "data-color-range") || false;
    if(colorRange) {
      colorRange[0] = parseColor(colorRange[0]);
      colorRange[1] = parseColor(colorRange[1]);
    }
    
    // Retrieving options for text and stroke text
    textOpts = parseOptsWithStrings(elem, "data-text-opts");
    textStrokeOpts = parseOptsWithStrings(elem, "data-text-stroke-opts");
    
    // Separating X axis and Y axis sets
    xSets = [], ySets = [], zSets = [];
    for (i = 0; i < sets.length; i++) {
      xSets[i] = sets[i][0];
      ySets[i] = sets[i][1];
      
      if(typeof sets[i][4] != "undefined")
        zSets[i] = sets[i][4];
    }
    
    // Retrieving x-axis/y-axis ranges if present or use default if present or calculate if neither of them present in configuration
    xAxisRange = parseAttr(elem, "data-range-x") || parseAttr(elem, "data-range") || getRange(xSets, isStacked());
    yAxisRange = parseAttr(elem, "data-range-y") || parseAttr(elem, "data-range") || getRange(ySets, isStacked());

    if(zSets.length > 0)
      zAxisRange = parseAttr(elem, "data-range-z") || getRange(zSets, false);

    var set, fillStyle, alphaMultiplier, offsetX, offsetY;
    
    // Drawing Axis for range based on provided opts
    drawAxisForRanges(xAxisRange, yAxisRange);

    // Plotting
    for (i = 0; i < sets.length; i++) {
      set = sets[i];

      // Draw Text and Circles for Scatter Plot Chart
      var x, y, z, alpha, 
          fillColor = colors && colorOf(i) || themes[opts.theme] || themes.basic || '#000';
      
      x = getXForValueAndRange(set[0], xAxisRange);
      y = getYForValueAndRange(set[1], yAxisRange);
      z = !isNaN(opts.bubblesRadius) ? +opts.bubblesRadius : (set[4] && zAxisRange ? getZForValueAndRange(set[4], zAxisRange) : (!isNaN(opts.bubblesDefaultRadius) ? +opts.bubblesDefaultRadius : width / 25));
      
      if(opts.bubbles || opts.bubble) {
        alpha = opts.bubblesAlpha || opts.alphaBubble || opts.alpha || 1;
        fillColor = set[3] || colorRange && toRGBString(mixColor(colorRange[0], colorRange[1], +set[4]/zAxisRange[1])) || opts.bubblesFillColor || fillColor;
        fillStyle = toRGBString(sheerColor(parseColor(fillColor), alpha));

        drawCircle(fillStyle, x, y, z);
      }

      ctx.textAlign = 'center';

      // Drawing Text Stroke
      if(textStrokeOpts) {
        offsetX = !isNaN(textStrokeOpts.offsetX) ? +textStrokeOpts.offsetX : 0;
        offsetY = !isNaN(textStrokeOpts.offsetY) ? +textStrokeOpts.offsetY : 0;
        alpha = textStrokeOpts.alpha || false;
        fillColor = textStrokeOpts.color || '#FFF';

        if(alpha)
          ctx.fillStyle = toRGBString(sheerColor(parseColor(fillColor), alpha));
        else
          ctx.fillStyle = fillColor;
        
        ctx.font = textStrokeOpts.font || '10px sans-serif';
        //typeof textStrokeOpts.maxWidth != "undefined" ? ctx.strokeText(set[2], x + offsetX, y + offsetY, textStrokeOpts.maxWidth) : ctx.strokeText(set[2], x + offsetX, y + offsetY);
        typeof textStrokeOpts.maxWidth != "undefined" ? ctx.fillText(set[2], x + offsetX, y + offsetY, textStrokeOpts.maxWidth) : ctx.fillText(set[2], x + offsetX, y + offsetY);
      }

      // Drawing Text
      alpha = false, offsetX = 0, offsetY = 0;
      if(textOpts) {
        offsetX = !isNaN(textOpts.offsetX) ? +textOpts.offsetX : 0;
        offsetY = !isNaN(textOpts.offsetY) ? +textOpts.offsetY : 0;
        alpha = textOpts.alpha || false;
        fillColor = textOpts.color || set[3] || textOpts.defaulColor || colors && colorOf(i) || opts.theme && themes[opts.theme] || themes.basic || '#000';
      }

      if(alpha)
        ctx.fillStyle = toRGBString(sheerColor(parseColor(fillColor), alpha));
      else
        ctx.fillStyle = fillColor;

      ctx.font = textOpts && textOpts.font || '10px sans-serif';

      // Drawshape via shapefn if provided or draw text
      if(set[2].indexOf('fn#') > -1) {
        eval(set[2].replace('fn#','') + '(ctx, x + offsetX, y + offsetY, z);');
      } else {
        textOpts && typeof textOpts.maxWidth != "undefined" ? ctx.fillText(set[2], x + offsetX, y + offsetY, textOpts.maxWidth) : ctx.fillText(set[2], x + offsetX, y + offsetY);
      }
    }
  }

  // Render a pie chart
  function renderGaugeChart() {
    var exposedObj = {}, elem = ctx.canvas, opts, areas, calibration, calibrations, range, width=elem.width, height=elem.height, i, j, gaugeDiameter, gaugeRadius, gaugeCenter, xMargin, tickValue, minorTickValue, gaugeShift, gaugeValueRadians, getShiftedRadians, getTarget, drawGauge, animateIt, animatedMove, animatedMovePosition;
    range = parseAttr(elem, "data-range") || [];
    range[0] = range && !isNaN(range[0]) ? +range[0] : 0;
    range[1] = range && !isNaN(range[1]) ? +range[1] : 100;
    
    opts = parseOptsWithStrings(elem, "data-opts");

    // Here areas will represent the colured segments of gauge in a form [upperLimit fillStyle] e.g. "[30 'rgba(150, 100, 100, 0.6)'] [70 'rgba(255, 0, 0, 1)']"
    areas = elem.getAttribute("data-areas") !== null ? parseSetsWithStrings(elem.getAttribute("data-areas")) : null;
    calibrations = elem.getAttribute("data-calibrations") !== null ? parseSetsWithStrings(elem.getAttribute("data-calibrations")) : null;

    // Tick Marks/Steps
    opts.majorTicks = !isNaN(opts.majorTicks) ? +opts.majorTicks : 10;
    opts.majorTicksWidth = !isNaN(opts.majorTicksWidth) ? +opts.majorTicksWidth : 2
    opts.majorTicksStyle = opts.majorTicksStyle || 'rgba(0, 0, 0, 0.6)';
    opts.majorTicksLengthRatio = !isNaN(opts.majorTicksLengthRatio) ? +opts.majorTicksLengthRatio : 0.8;
    
    opts.minorTicks = opts.minorTicks && !isNaN(opts.minorTicks) ? +opts.minorTicks : false; // Optional
    opts.minorTicksWidth = !isNaN(opts.minorTicksWidth) ? +opts.minorTicksWidth : 1
    opts.minorTicksStyle = opts.minorTicksStyle || 'rgba(50, 50, 50, 0.8)';
    opts.minorTicksLengthRatio = !isNaN(opts.minorTicksLengthRatio) ? +opts.minorTicksLengthRatio : 0.82;
    
    opts.gaugeBackground = opts.gaugeBackground || 'rgba(90, 100, 120, 0.5)';
    opts.calibrationRadiusRatio = !isNaN(opts.calibrationRadiusRatio) ? +opts.calibrationRadiusRatio : 1;
    
    gaugeDiameter = !isNaN(opts.widthRatio) ? (+opts.widthRatio * width) : (!isNaN(opts.heightRatio) ? (+opts.heightRatio * height) : (width * 0.95));
    gaugeRadius = gaugeDiameter / 2;
    xMargin = (width - gaugeDiameter) / 2;
    gaugeCenter = {h: width / 2, k: height * 0.95};

    gaugeShift = Math.PI * 0.04; // Margins to leave from both ends of semi circle for plotting
    gaugeValueRadians = Math.PI - (gaugeShift * 2);
    tickValue = (gaugeValueRadians) / opts.majorTicks;
    minorTickValue = opts.minorTicks && ( tickValue / (opts.minorTicks + 1) ) || false;

    // Helper Functions
    getShiftedRadians = function(val){return ( val / range[1] * gaugeValueRadians ) + gaugeShift} // Converts to radians, shifts and returns
    getTarget = function(){if(!isNaN(opts.target)){return +opts.target > range[1] ? range[1] : (+opts.target >= range[0] ? +opts.target : range[0])}return range[0];}

    // Drawing method
    drawGauge = function(shiftedRadTarget) {
      ctx = elem.getContext("2d");
      ctx.clearRect(0, 0, width, height); // clear canvas

      // Drawing gauge background arc
      drawFilledArc(ctx, gaugeCenter, ((width / 2)-xMargin), (width < 100 ? 5 : 10), Math.PI, Math.PI * 2, opts.gaugeBackground);

      // Drawing gauge colored arcs
      if(areas){
        var startAngel = Math.PI + gaugeShift, endAngle;
        for(i=0; i < areas.length; i++) {
          var set = areas[i],
              startPoint = getPointOnCircle(gaugeCenter, gaugeRadius, startAngel, 0.88);
          
          endAngle = Math.PI + getShiftedRadians(+set[0]);
          
          var endPoint = getPointOnCircle(gaugeCenter, gaugeRadius, endAngle, 0.88);

          // Drawing colored arcs/areas applying gradient if desired
          var areasRadius = !isNaN(opts.areasRadiusRatio) ? ( gaugeRadius * 0.88 * (1 - +opts.areasRadiusRatio) ) : gaugeRadius * 0.18;
          if(typeof opts.gradientAreas != 'undefined' && opts.gradientAreas != "false") {
            var grd = ctx.createLinearGradient(startPoint.x, startPoint.y, endPoint.x, endPoint.y);
            grd.addColorStop(0, set[1]);
            grd.addColorStop(0.2, set[1]);
            grd.addColorStop(1, areas[i-1] && areas[i-1][1] || opts.gaugeBackground);
            drawFilledArc(ctx, gaugeCenter, gaugeRadius * 0.88, areasRadius, startAngel, endAngle, grd);
          } else {
            drawFilledArc(ctx, gaugeCenter, gaugeRadius * 0.88, areasRadius, startAngel, endAngle, set[1]);
          }
          
          startAngel = endAngle;
        }
      }

      // Drawing major ticks
      // Formula: x=h+rcosθ, y=k+rsinθ for point (x, y) on circle having center (h, k) and radius r for angle θ
      for (i = 0; i < opts.majorTicks + 1; i++)
      {
          var majorStep = (i * tickValue) + gaugeShift;
          drawCalibration(ctx, gaugeCenter, gaugeRadius, majorStep, 0.88, opts.majorTicksLengthRatio, 'tick', opts.majorTicksStyle, opts.majorTicksWidth);

          // Drawing calibration
          if(typeof opts.calibrate != "undefined" && opts.calibrate != "false") {
            var calibrationValue = (calibrations && typeof calibrations[0][i] != "undefined") ? calibrations[0][i] : Math.round( i == opts.majorTicks ? range[1] : ( i == 0 ? range[0] : range[1] / opts.majorTicks * i ) );
            var font = opts.calibrationFont || '10px sans-serif';
            var style = opts.calibrationStyle || 'rgba(0, 0, 0, 0.9)';
            drawCalibration(ctx, gaugeCenter, gaugeRadius, majorStep, opts.calibrationRadiusRatio, opts.calibrationRadiusRatio-0.1, calibrationValue, style, null, font);
          }

          // Calculating and plotting minor ticks for current major tick
          if(minorTickValue && i < opts.majorTicks) {
            for(j=0; j < opts.minorTicks; j++) {
              majorStep += minorTickValue
              drawCalibration(ctx, gaugeCenter, gaugeRadius, majorStep, 0.88, opts.minorTicksLengthRatio, 'tick', opts.minorTicksStyle, opts.minorTicksWidth);
            }
          }
      }

      // Drawing Gauge Title
      if(typeof opts.title != "undefined" && opts.title) {
        ctx.textAlign = 'center';
        ctx.font = opts.titleFont || '10px sans-serif';
        ctx.fillStyle = opts.titleStyle || '#000';
        ctx.fillText(opts.title, gaugeCenter.h, gaugeCenter.k - gaugeRadius * 0.4, gaugeDiameter);
      }

      // Drawing and Targetting gauge needle
      ctx.save();
      ctx.translate(gaugeCenter.h, gaugeCenter.k);
      ctx.rotate(shiftedRadTarget - Math.PI/2);
      ctx.translate(-gaugeCenter.h, -gaugeCenter.k);

      var needleWidthRatio = !isNaN(opts.needleWidthRatio) ? +opts.needleWidthRatio : 1;
      ctx.fillStyle = opts.needleFillStyle || 'rgba(220, 60, 20, 0.6)';
      ctx.strokeStyle = opts.needleStrokeStyle || 'rgba(200, 50, 20, 0.8)';
      ctx.beginPath();
      ctx.moveTo(gaugeCenter.h, gaugeCenter.k - gaugeRadius * 0.88 );
      ctx.bezierCurveTo(gaugeCenter.h + gaugeRadius * 0.04 * needleWidthRatio, gaugeCenter.k - gaugeRadius * 0.4, gaugeCenter.h + gaugeRadius * 0.03 * needleWidthRatio, gaugeCenter.k - gaugeRadius * 0.2, gaugeCenter.h + gaugeRadius * 0.02 * needleWidthRatio, gaugeCenter.k);
      ctx.lineTo(gaugeCenter.h - gaugeRadius * 0.02 * needleWidthRatio, gaugeCenter.k);
      ctx.bezierCurveTo(gaugeCenter.h - gaugeRadius * 0.03 * needleWidthRatio, gaugeCenter.k - gaugeRadius * 0.2, gaugeCenter.h - gaugeRadius * 0.04 * needleWidthRatio, gaugeCenter.k - gaugeRadius * 0.4, gaugeCenter.h, gaugeCenter.k - gaugeRadius * 0.88);
      ctx.fill();
      ctx.stroke();

      ctx.restore();

      // Drawing needle base
      ctx.fillStyle = opts.needleBaseFillStyle || 'rgba(200, 150, 40, 0.9)';
      ctx.strokeStyle = opts.needleBaseStrokeStyle || 'rgba(220, 160, 30, 0.5)';
      ctx.beginPath();
      var needleBaseRadius = needleWidthRatio > 0.7 ? gaugeRadius * 0.12 * needleWidthRatio : gaugeRadius * 0.12;
      ctx.arc(gaugeCenter.h, gaugeCenter.k, needleBaseRadius , Math.PI * 0.95, Math.PI * 0.05);
      ctx.fill();
      ctx.stroke();
    } // End - drawGauge
    
    animateIt = win.requestAnimationFrame || win.webkitRequestAnimationFrame || win.mozRequestAnimationFrame || win.msRequestAnimationFrame || function (callback) { win.setTimeout(callback, 1000 / 60); };
    animatedMove = function() {
      var delta = opts.target - animatedMovePosition;
      animatedMovePosition += delta/10;
      if(animatedMovePosition != getTarget() && Math.abs(delta / range[1]) > 0.05) {
        drawGauge(getShiftedRadians(animatedMovePosition));
        animateIt(animatedMove);
      } else {
        drawGauge(getShiftedRadians(opts.target));
      }
    }

    // Exposed methods
    exposedObj.setTarget = function(val, doAnimate) {
      animatedMovePosition = getTarget();
      opts.target = !isNaN(+val) ? +val : getTarget();
      
      if(typeof doAnimate == "undefined" || doAnimate) {
        animateIt(animatedMove);
      } else {
        drawGauge(getShiftedRadians(opts.target));
      }
    }

    exposedObj.getTarget = getTarget;

    exposedObj.setTitle = function(title) { opts.title = title; drawGauge(getShiftedRadians(opts.target)); }
    
    exposedObj.redraw = function() { drawGauge(getShiftedRadians(opts.target)); }

    // Exposing object window object scope
    if(typeof opts.objectName != "undefined") {
      eval('win.' + opts.objectName + '=exposedObj;');
    }

    // First Time Drawing
    drawGauge(getShiftedRadians(getTarget()));
  }

  // Render or re-render the chart for the given element
  function init(elem) {
    if (win.devicePixelRatio > 1) {
      if (!elem.__resized) {
        elem.style.width = elem.width + "px";
        elem.style.height = elem.height + "px";
        elem.width = 2 * elem.width;
        elem.height = 2 * elem.height;
        elem.__resized = true;
      }
    }

    type = parseAttr(elem, "data-type")[0];
    sets = elem.getAttribute("data-sets") !== null ? parseSets(elem.getAttribute("data-sets")) : null;
    opts = parseOpts(elem);
    ctx = elem.getContext("2d");
    width = elem.width;
    height = elem.height;
    colors = themes[opts.theme] || parseAttr(elem, "data-colors") || themes.basic;
    range = parseAttr(elem, "data-range") || sets && getRange(sets, isStacked()) || null;
    rotated = false;

    // erase
    elem.width = elem.width;

    // set background color
    if (opts.bgcolor) {
      drawRect(opts.bgcolor || "#fff", 0, 0, width, -height);
    }

    try {
      renderers[type](ctx, width, height, sets, opts);
    }
    catch (e) {
      console.error(e.message);
    }
  }

  // The API
  Chartlets = {
    // Render charts for an array of elements, or render all elements with class "chartlet"
    render: function (elems) {
      var i;

      if (!elems) {
        elems = document.querySelectorAll(".chartlet");
      }

      for (i = 0; i < elems.length; i++) {
        init(elems[i]);
      }
    },

    // Set a color theme. e.g. setTheme("disco", ["#123", "#456", "#789"])
    setTheme: function (name, palette) {
      themes[name] = palette;
    },

    // Get a color theme as an array of strings
    getTheme: function (name) {
      return name ? themes[name] : colors;
    },

    setRenderer: function (type, renderer) {
      renderers[type] = renderer;
    },

    // Update data sets for the given element (or ID)
    update: function (elem, sets, options) {
      if (typeof elem === "string") {
        elem = document.getElementById(elem);
      }

      if (options && options.transition === "linear") {
        new Transition(elem, parseSets(elem.getAttribute("data-sets")), sets);
        return;
      }

      elem.setAttribute("data-sets", JSON.stringify(sets));

      this.render([elem]);
    }
  };

  win.Chartlets = Chartlets;

}(window));
