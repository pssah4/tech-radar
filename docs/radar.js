// The MIT License (MIT)

// Copyright (c) 2017-2024 Zalando SE

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.


function radar_visualization(config) {

  config.svg_id = config.svg || "radar";
  config.width = config.width || 1450;
  config.height = config.height || 1000;
  config.colors = ("colors" in config) ? config.colors : {
      background: "#fff",
      grid: '#dddde0',
      inactive: "#ddd"
    };
  config.print_layout = ("print_layout" in config) ? config.print_layout : true;
  config.links_in_new_tabs = ("links_in_new_tabs" in config) ? config.links_in_new_tabs : true;
  config.repo_url = config.repo_url || '#';
  config.print_ring_descriptions_table = ("print_ring_descriptions_table" in config) ? config.print_ring_descriptions_table : false;
  config.legend_offset = config.legend_offset || [
    { x: 450, y: 90 },
    { x: -675, y: 90 },
    { x: -675, y: -310 },
    { x: 450, y: -310 }
  ]
  config.title_offset = config.title_offset || { x: -675, y: -420 };
  config.footer_offset = config.footer_offset || { x: -155, y: 450 };
  config.legend_column_width = config.legend_column_width || 140
  config.legend_line_height = config.legend_line_height || 10

  // custom random number generator, to make random sequence reproducible
  // source: https://stackoverflow.com/questions/521295
  var seed = 42;
  function random() {
    var x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  }

  function random_between(min, max) {
    return min + random() * (max - min);
  }

  function normal_between(min, max) {
    return min + (random() + random()) * 0.5 * (max - min);
  }

  // number of segments is derived from the quadrant config, so the radar supports
  // any N (the original was hardcoded to 4). With N segments the circle is split
  // into N equal angular wedges.
  const num_segments = config.quadrants.length;
  const segment_angle = 2 * Math.PI / num_segments;

  // radial_min / radial_max are absolute angles in radians (the original stored
  // multiples of PI for the 4 fixed quadrants). segment() and viewbox() derive
  // everything else (midpoint, bounding box) from these two angles.
  const quadrants = [];
  for (var qi = 0; qi < num_segments; qi++) {
    quadrants.push({
      radial_min: segment_angle * qi,
      radial_max: segment_angle * (qi + 1)
    });
  }

  // The original 4-corner legend layout does not fit N segments. Rebuild it as two
  // vertical columns (left / right of the radar) unless an explicit list with the
  // matching length was provided.
  if (!("legend_offset" in config) || config.legend_offset.length !== num_segments) {
    config.legend_offset = [];
    var per_side = Math.ceil(num_segments / 2);
    var legend_top = -540;
    var legend_step = per_side > 1 ? Math.min(360, 1040 / (per_side - 1)) : 0;
    for (var li = 0; li < num_segments; li++) {
      var on_right = li < per_side;
      var row = on_right ? li : li - per_side;
      config.legend_offset.push({
        x: on_right ? 480 : -780,
        y: legend_top + row * legend_step
      });
    }
  }

  const rings = [
    { radius: 130 },
    { radius: 220 },
    { radius: 310 },
    { radius: 400 }
  ];

  function polar(cartesian) {
    var x = cartesian.x;
    var y = cartesian.y;
    return {
      t: Math.atan2(y, x),
      r: Math.sqrt(x * x + y * y)
    }
  }

  function cartesian(polar) {
    return {
      x: polar.r * Math.cos(polar.t),
      y: polar.r * Math.sin(polar.t)
    }
  }

  function bounded_interval(value, min, max) {
    var low = Math.min(min, max);
    var high = Math.max(min, max);
    return Math.min(Math.max(value, low), high);
  }

  // pick black or white text so it stays legible on a given fill colour (white on the
  // bright yellow / salmon rings is unreadable otherwise)
  function contrastText(color) {
    var c = String(color || "").replace("#", "");
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    var r = parseInt(c.substr(0, 2), 16) / 255;
    var g = parseInt(c.substr(2, 2), 16) / 255;
    var b = parseInt(c.substr(4, 2), 16) / 255;
    if (isNaN(r) || isNaN(g) || isNaN(b)) return "#ffffff";
    var lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // threshold 0.45 keeps dark text on the mid-light ring colours (green/teal as well
    // as yellow/salmon), all of which fail WCAG AA against white
    return lum > 0.45 ? "#1a1a1a" : "#ffffff";
  }

  function segment(quadrant, ring) {
    var q = quadrants[quadrant];
    var t_min = q.radial_min;
    var t_max = q.radial_max;
    var t_mid = (t_min + t_max) / 2;
    var r_min = ring === 0 ? 30 : rings[ring - 1].radius;
    var r_max = rings[ring].radius;
    var pad_r = 15;
    // angular padding keeps blips off the wedge borders; it shrinks for narrow wedges
    var pad_t = Math.min((t_max - t_min) * 0.10, 0.12);

    // Clamp an absolute angle into this wedge. Unwrap to the branch nearest the wedge
    // midpoint first, so the atan2 seam at +/-PI never flings a blip to the far edge.
    function clamp_angle(t) {
      while (t < t_mid - Math.PI) t += 2 * Math.PI;
      while (t >= t_mid + Math.PI) t -= 2 * Math.PI;
      return bounded_interval(t, t_min + pad_t, t_max - pad_t);
    }

    // Clamp a point into the wedge (angle) and the ring band (radius). Replaces the
    // original axis-aligned bounding box, which only worked for axis-aligned quadrants.
    function clamp_point(d) {
      var p = polar(d);
      var t = clamp_angle(p.t);
      var r = bounded_interval(p.r, r_min + pad_r, r_max - pad_r);
      var c = cartesian({ t: t, r: r });
      d.x = c.x; // adjust data too!
      d.y = c.y;
      return d;
    }

    return {
      clipx: function(d) { return clamp_point(d).x; },
      clipy: function(d) { return clamp_point(d).y; },
      random: function() {
        return cartesian({
          t: random_between(t_min + pad_t, t_max - pad_t),
          r: normal_between(r_min + pad_r, r_max - pad_r)
        });
      }
    }
  }

  // position each entry randomly in its segment
  for (var i = 0; i < config.entries.length; i++) {
    var entry = config.entries[i];
    entry.segment = segment(entry.quadrant, entry.ring);
    var point = entry.segment.random();
    entry.x = point.x;
    entry.y = point.y;
    entry.color = entry.active || config.print_layout ?
      config.rings[entry.ring].color : config.colors.inactive;
  }

  // partition entries according to segments
  var segmented = new Array(num_segments);
  for (let quadrant = 0; quadrant < num_segments; quadrant++) {
    segmented[quadrant] = new Array(rings.length);
    for (var ring = 0; ring < rings.length; ring++) {
      segmented[quadrant][ring] = [];
    }
  }
  for (var i=0; i<config.entries.length; i++) {
    var entry = config.entries[i];
    segmented[entry.quadrant][entry.ring].push(entry);
  }

  // assign unique sequential id to each entry, segment by segment, ring by ring
  var id = 1;
  for (var quadrant = 0; quadrant < num_segments; quadrant++) {
    for (var ring = 0; ring < rings.length; ring++) {
      var entries = segmented[quadrant][ring];
      entries.sort(function(a,b) { return a.label.localeCompare(b.label); })
      for (var i=0; i<entries.length; i++) {
        entries[i].id = "" + id++;
      }
    }
  }

  function translate(x, y) {
    return "translate(" + x + "," + y + ")";
  }

  // Frame a single wedge for the optional zoomed view. Computed from the wedge's real
  // angular extent (centre, both radial edges, the outer arc and any axis extreme the
  // arc crosses), so it is correct for any number of segments, not just axis-aligned N=4.
  function viewbox(quadrant) {
    var q = quadrants[quadrant];
    var R = rings[rings.length - 1].radius;
    var pad = 20;
    var pts = [
      { x: 0, y: 0 },
      { x: R * Math.cos(q.radial_min), y: R * Math.sin(q.radial_min) },
      { x: R * Math.cos(q.radial_max), y: R * Math.sin(q.radial_max) }
    ];
    // the outer arc reaches an axis extreme (+-R) wherever it crosses a cardinal angle
    var cardinals = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2, 2 * Math.PI];
    for (var c = 0; c < cardinals.length; c++) {
      if (cardinals[c] >= q.radial_min && cardinals[c] <= q.radial_max) {
        pts.push({ x: R * Math.cos(cardinals[c]), y: R * Math.sin(cardinals[c]) });
      }
    }
    var xs = pts.map(function(p) { return p.x; });
    var ys = pts.map(function(p) { return p.y; });
    var minX = Math.min.apply(null, xs);
    var minY = Math.min.apply(null, ys);
    var width = Math.max.apply(null, xs) - minX;
    var height = Math.max.apply(null, ys) - minY;
    return [minX - pad, minY - pad, width + 2 * pad, height + 2 * pad].join(" ");
  }

  // adjust with config.scale.
  config.scale = config.scale || 1;
  var scaled_width = config.width * config.scale;
  var scaled_height = config.height * config.scale;

  var svg = d3.select("svg#" + config.svg_id)
    .style("background-color", config.colors.background)
    .attr("width", scaled_width)
    .attr("height", scaled_height);

  var radar = svg.append("g");
  if ("zoomed_quadrant" in config) {
    svg.attr("viewBox", viewbox(config.zoomed_quadrant));
  } else {
    // a viewBox spanning the full canvas lets the SVG scale responsively via CSS
    // (max-width: 100%) instead of forcing horizontal scroll on smaller screens
    svg.attr("viewBox", "0 0 " + scaled_width + " " + scaled_height);
    radar.attr("transform", translate(scaled_width / 2, scaled_height / 2).concat(`scale(${config.scale})`));
  }

  var grid = radar.append("g");

  // --- segment zoom (Thoughtworks-style: click a segment to zoom into it) -----------
  // The radar group is translated to the canvas centre, so the zoom viewBox is computed
  // in SVG coordinates (the segment's bounding box shifted by the centre offset).
  var currentZoom = null;
  var fullViewBox = "0 0 " + scaled_width + " " + scaled_height;

  function segmentViewBox(q) {
    var Rg = rings[rings.length - 1].radius;
    var pad = 34;
    var amin = segment_angle * q, amax = segment_angle * (q + 1);
    var xs = [0, Rg * Math.cos(amin), Rg * Math.cos(amax)];
    var ys = [0, Rg * Math.sin(amin), Rg * Math.sin(amax)];
    var cardinals = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2, 2 * Math.PI];
    for (var c = 0; c < cardinals.length; c++) {
      if (cardinals[c] >= amin && cardinals[c] <= amax) {
        xs.push(Rg * Math.cos(cardinals[c]));
        ys.push(Rg * Math.sin(cardinals[c]));
      }
    }
    var minX = Math.min.apply(null, xs) - pad, minY = Math.min.apply(null, ys) - pad;
    var w = Math.max.apply(null, xs) - Math.min.apply(null, xs) + 2 * pad;
    var h = Math.max.apply(null, ys) - Math.min.apply(null, ys) + 2 * pad;
    return (minX + scaled_width / 2) + " " + (minY + scaled_height / 2) + " " + w + " " + h;
  }

  function hoverSegment(q, on) {
    grid.selectAll(".seg-fill").style("opacity", function() {
      return (!on || +this.getAttribute("data-seg") === q) ? 1 : 0.5;
    });
  }

  function zoomToSegment(q) {
    currentZoom = q;
    svg.transition().duration(650).attr("viewBox", segmentViewBox(q));
    grid.selectAll(".seg-fill").transition().duration(400)
      .style("opacity", function() { return +this.getAttribute("data-seg") === q ? 1 : 0.12; });
    grid.selectAll(".seg-rim").transition().duration(250)
      .style("opacity", function() { return +this.getAttribute("data-seg") === q ? 1 : 0; });
    rink.selectAll("g.blip").transition().duration(400)
      .style("opacity", function(d) { return d.quadrant === q ? 1 : 0.05; });
    if (config.onSegmentSelect) config.onSegmentSelect(q);
  }

  function zoomReset() {
    currentZoom = null;
    svg.transition().duration(650).attr("viewBox", fullViewBox);
    grid.selectAll(".seg-fill").transition().duration(400).style("opacity", 1);
    grid.selectAll(".seg-rim").transition().duration(250).style("opacity", 1);
    rink.selectAll("g.blip").transition().duration(400).style("opacity", 1);
    if (config.onSegmentSelect) config.onSegmentSelect(null);
  }

  if (typeof window !== "undefined") {
    window.radarZoom = { to: zoomToSegment, reset: zoomReset, current: function() { return currentZoom; } };
  }

  // define default font-family
  config.font_family = config.font_family || "Arial, Helvetica";

  var grid_outer_radius = rings[rings.length - 1].radius;

  // segment background fills: a light tinted annular sector per segment, so the areas
  // read as distinct regions instead of bare wedges between thin lines. Drawn first
  // (under the rings, spokes, labels and blips).
  function sectorPath(t0, t1, ri, ro) {
    var large = (t1 - t0) > Math.PI ? 1 : 0;
    return "M " + (ri * Math.cos(t0)) + " " + (ri * Math.sin(t0)) +
      " L " + (ro * Math.cos(t0)) + " " + (ro * Math.sin(t0)) +
      " A " + ro + " " + ro + " 0 " + large + " 1 " + (ro * Math.cos(t1)) + " " + (ro * Math.sin(t1)) +
      " L " + (ri * Math.cos(t1)) + " " + (ri * Math.sin(t1)) +
      " A " + ri + " " + ri + " 0 " + large + " 0 " + (ri * Math.cos(t0)) + " " + (ri * Math.sin(t0)) + " Z";
  }
  for (var sf = 0; sf < num_segments; sf++) {
    if (config.quadrants[sf] && config.quadrants[sf].color) {
      (function(qi) {
        var path = grid.append("path")
          .attr("class", "seg-fill")
          .attr("data-seg", qi)
          .attr("d", sectorPath(segment_angle * qi, segment_angle * (qi + 1), 30, grid_outer_radius))
          .style("fill", config.quadrants[qi].color)
          .style("stroke", "none");
        if (config.segment_zoom) {
          path.style("cursor", "pointer")
            .on("click", function() { zoomToSegment(qi); })
            .on("mouseover", function() { if (currentZoom === null) hoverSegment(qi, true); })
            .on("mouseout", function() { if (currentZoom === null) hoverSegment(qi, false); });
        }
      })(sf);
    }
  }

  // segment divider spokes: white gutters separate the tinted areas cleanly
  for (var s = 0; s < num_segments; s++) {
    grid.append("line")
      .attr("x1", 0).attr("y1", 0)
      .attr("x2", grid_outer_radius * Math.cos(segment_angle * s))
      .attr("y2", grid_outer_radius * Math.sin(segment_angle * s))
      .style("stroke", "#ffffff")
      .style("stroke-width", 2);
  }

  // background color filter. Usage `.attr("filter", "url(#solid)")`
  // SOURCE: https://stackoverflow.com/a/31013492/2609980
  var defs = grid.append("defs");
  var filter = defs.append("filter")
    .attr("x", 0).attr("y", 0).attr("width", 1).attr("height", 1).attr("id", "solid");
  filter.append("feFlood").attr("flood-color", "rgb(0, 0, 0, 0.8)");
  filter.append("feComposite").attr("in", "SourceGraphic");

  // ring boundary circles, each stroked in its ring colour so the four rings are
  // distinguishable at a glance
  for (var i = 0; i < rings.length; i++) {
    grid.append("circle")
      .attr("cx", 0).attr("cy", 0)
      .attr("r", rings[i].radius)
      .style("fill", "none")
      .style("stroke", (config.rings[i] && config.rings[i].color) || config.colors.grid)
      .style("stroke-width", 2)
      .style("opacity", 0.55);
  }

  // (ring labels are drawn later, in a layer above the blips, so they stay readable)

  // segment labels around the outer rim, so each area is named on the radar itself
  if (config.print_layout && config.draw_segment_labels !== false) {
    for (var sl = 0; sl < num_segments; sl++) {
      var segObj = config.quadrants[sl] || {};
      var midA = segment_angle * (sl + 0.5);
      var lr = grid_outer_radius + 18;
      var anchor = Math.cos(midA) > 0.3 ? "start" : (Math.cos(midA) < -0.3 ? "end" : "middle");
      var dyA = Math.sin(midA) > 0.3 ? 15 : (Math.sin(midA) < -0.3 ? -7 : 4);
      var rimLabel = grid.append("text")
        .attr("class", "seg-rim")
        .attr("data-seg", sl)
        .text(segObj.name || "")
        .attr("x", lr * Math.cos(midA))
        .attr("y", lr * Math.sin(midA) + dyA)
        .attr("text-anchor", anchor)
        .style("fill", segObj.accent || "#333")
        .style("font-family", config.font_family)
        .style("font-size", "15px").style("font-weight", "bold")
        .style("paint-order", "stroke")
        .style("stroke", "#ffffff").style("stroke-width", "4px")
        .style("stroke-linejoin", "round")
        .style("user-select", "none");
      if (config.segment_zoom) {
        (function(qi) {
          rimLabel.style("cursor", "pointer").on("click", function() { zoomToSegment(qi); });
        })(sl);
      } else {
        rimLabel.style("pointer-events", "none");
      }
    }
  }

  function legend_transform(quadrant, ring, legendColumnWidth, index=null, previousHeight = null) {
    const dx = ring < 2 ? 0 : legendColumnWidth;
    let dy = (index == null ? -16 : index * config.legend_line_height);

    if (ring % 2 === 1) {
      dy = dy + 36 + previousHeight;
    }

    return translate(
      config.legend_offset[quadrant].x + dx,
      config.legend_offset[quadrant].y + dy
    );
  }

  // draw title, footer and legend (only in print layout; each gated so the host page
  // can move them into HTML around the radar)
  if (config.print_layout) {
    if (config.draw_title !== false) {
    // title
    radar.append("a")
      .attr("href", config.repo_url)
      .attr("transform", translate(config.title_offset.x, config.title_offset.y))
      .append("text")
      .attr("class", "hover-underline")  // add class for hover effect
      .text(config.title)
      .style("font-family", config.font_family)
      .style("font-size", "30")
      .style("font-weight", "bold")

    // date
    radar
      .append("text")
      .attr("transform", translate(config.title_offset.x, config.title_offset.y + 20))
      .text(config.date || "")
      .style("font-family", config.font_family)
      .style("font-size", "14")
      .style("fill", "#999")
    }

    if (config.draw_footer !== false) {
    // footer
    radar.append("text")
      .attr("transform", translate(config.footer_offset.x, config.footer_offset.y))
      .text("▲ moved up     ▼ moved down     ★ new     ⬤ no change")
      .attr("xml:space", "preserve")
      .style("font-family", config.font_family)
      .style("font-size", "12px");
    }

    if (config.draw_legend !== false) {
    // legend
    const legend = radar.append("g");
    for (let quadrant = 0; quadrant < num_segments; quadrant++) {
      legend.append("text")
        .attr("transform", translate(
          config.legend_offset[quadrant].x,
          config.legend_offset[quadrant].y - 45
        ))
        .text(config.quadrants[quadrant].name)
        .style("font-family", config.font_family)
        .style("font-size", "18px")
        .style("font-weight", "bold");
      let previousLegendHeight = 0
      for (let ring = 0; ring < rings.length; ring++) {
        if (ring % 2 === 0) {
          previousLegendHeight = 0
        }
        legend.append("text")
          .attr("transform", legend_transform(quadrant, ring, config.legend_column_width, null, previousLegendHeight))
          .text(config.rings[ring].name)
          .style("font-family", config.font_family)
          .style("font-size", "12px")
          .style("font-weight", "bold")
          .style("fill", config.rings[ring].color);
        legend.selectAll(".legend" + quadrant + ring)
          .data(segmented[quadrant][ring])
          .enter()
            .append("a")
              .attr("href", function (d, i) {
                 return d.link ? d.link : "#"; // stay on same page if no link was provided
              })
              // Add a target if (and only if) there is a link and we want new tabs
              .attr("target", function (d, i) {
                 return (d.link && config.links_in_new_tabs) ? "_blank" : null;
              })
            .append("text")
              .attr("transform", function(d, i) { return legend_transform(quadrant, ring, config.legend_column_width, i, previousLegendHeight); })
              .attr("class", "legend" + quadrant + ring)
              .attr("id", function(d, i) { return "legendItem" + d.id; })
              .text(function(d) { return d.id + ". " + d.label; })
              .style("font-family", config.font_family)
              .style("font-size", "11px")
              .style("cursor", "pointer")
              .on("mouseover", function(event, d) { showBubble(d); highlightLegendItem(d); })
              .on("mouseout", function(event, d) { hideBubble(d); unhighlightLegendItem(d); })
              .on("click", function(event, d) { event.preventDefault(); showInfo(d); })
              .call(wrap_text)
              .each(function() {
                previousLegendHeight += d3.select(this).node().getBBox().height;
              });
      }
    }
    }
  }

  function wrap_text(text) {
    let heightForNextElement = 0;

    text.each(function() {
      const textElement = d3.select(this);
      const words = textElement.text().split(" ");
      let line = [];

      // Use '|' at the end of the string so that spaces are not trimmed during rendering.
      const number = `${textElement.text().split(".")[0]}. |`;
      const legendNumberText = textElement.append("tspan").text(number);
      const legendBar = textElement.append("tspan").text('|');
      const numberWidth = legendNumberText.node().getComputedTextLength() - legendBar.node().getComputedTextLength();

      textElement.text(null);

      let tspan = textElement
          .append("tspan")
          .attr("x", 0)
          .attr("y", heightForNextElement)
          .attr("dy", 0);

      for (let position = 0; position < words.length; position++) {
        line.push(words[position]);
        tspan.text(line.join(" "));

        // Avoid wrap for first line (position !== 1) to not end up in a situation where the long text without
        // whitespace is wrapped (causing the first line near the legend number to be blank).
        if (tspan.node().getComputedTextLength() > config.legend_column_width && position !== 1) {
          line.pop();
          tspan.text(line.join(" "));
          line = [words[position]];

          tspan = textElement.append("tspan")
              .attr("x", numberWidth)
              .attr("dy", config.legend_line_height)
              .text(words[position]);
        }
      }

      const textBoundingBox = textElement.node().getBBox();
      heightForNextElement = textBoundingBox.y + textBoundingBox.height;
    });
  }

  // layer for entries
  var rink = radar.append("g")
    .attr("id", "rink");

  // ring labels: compact pills stacked along the top vertical, in ring colour. Drawn in
  // their own layer above the blips (but below the bubble) so blips never cover them.
  if (config.print_layout && config.draw_ring_labels !== false) {
    var ringLabelLayer = radar.append("g").attr("id", "ring-labels");
    for (var rl = 0; rl < rings.length; rl++) {
      var inner_r = rl === 0 ? 30 : rings[rl - 1].radius;
      var band_center = (inner_r + rings[rl].radius) / 2;
      var ringObj = config.rings[rl] || {};
      var ringColor = ringObj.labelColor || ringObj.color || "#555";
      var ringName = ringObj.name || "";
      var pillW = ringName.length * 8.5 + 18;
      var rlg = ringLabelLayer.append("g").attr("transform", translate(0, -band_center));
      rlg.append("rect")
        .attr("x", -pillW / 2).attr("y", -11).attr("width", pillW).attr("height", 21)
        .attr("rx", 10).attr("ry", 10)
        .style("fill", "#ffffff").style("opacity", 0.95)
        .style("stroke", ringColor).style("stroke-width", 1.2);
      rlg.append("text")
        .text(ringName)
        .attr("text-anchor", "middle").attr("y", 4)
        .style("fill", ringColor)
        .style("font-family", config.font_family)
        .style("font-size", "13px").style("font-weight", "bold")
        .style("letter-spacing", "0.5px")
        .style("pointer-events", "none").style("user-select", "none");
    }
  }

  // rollover bubble (on top of everything else)
  var bubble = radar.append("g")
    .attr("id", "bubble")
    .attr("x", 0)
    .attr("y", 0)
    .style("opacity", 0)
    .style("pointer-events", "none")
    .style("user-select", "none");
  bubble.append("rect")
    .attr("rx", 4)
    .attr("ry", 4)
    .style("fill", "#333");
  bubble.append("text")
    .style("font-family", config.font_family)
    .style("font-size", "10px")
    .style("fill", "#fff");
  bubble.append("path")
    .attr("d", "M 0,0 10,0 5,8 z")
    .style("fill", "#333");

  function showBubble(d) {
    if (d.active || config.print_layout) {
      var tooltip = d3.select("#bubble text")
        .text(d.label);
      var bbox = tooltip.node().getBBox();
      d3.select("#bubble")
        .attr("transform", translate(d.x - bbox.width / 2, d.y - 16))
        .style("opacity", 0.8);
      d3.select("#bubble rect")
        .attr("x", -5)
        .attr("y", -bbox.height)
        .attr("width", bbox.width + 10)
        .attr("height", bbox.height + 4);
      d3.select("#bubble path")
        .attr("transform", translate(bbox.width / 2 - 5, 3));
    }
  }

  function hideBubble(d) {
    var bubble = d3.select("#bubble")
      .attr("transform", translate(0,0))
      .style("opacity", 0);
  }

  // Highlight the matching legend entry when a blip is hovered. The legend now lives in
  // HTML (built by the host page), so toggle a class; guard against a missing element.
  function highlightLegendItem(d) {
    var legendItem = document.getElementById("legendItem" + d.id);
    if (legendItem) legendItem.classList.add("legend-hl");
  }

  function unhighlightLegendItem(d) {
    var legendItem = document.getElementById("legendItem" + d.id);
    if (legendItem) legendItem.classList.remove("legend-hl");
  }

  // Populate the HTML info box (defined in index.html) with the clicked blip.
  // radar.js stays agnostic: if no #blip-info element exists, the click is a no-op.
  function showInfo(d) {
    var panel = document.getElementById("blip-info");
    if (!panel) return;
    var segName = config.quadrants[d.quadrant] ? config.quadrants[d.quadrant].name : "";
    var ringObj = config.rings[d.ring] || {};
    panel.querySelector(".bi-title").textContent = d.id + ". " + d.label;
    var meta = panel.querySelector(".bi-meta");
    meta.textContent = segName + "  ·  " + (ringObj.name || "");
    meta.style.color = ringObj.color || "#333";
    panel.querySelector(".bi-desc").textContent = d.description || "Keine Beschreibung hinterlegt.";
    panel.style.borderLeftColor = ringObj.color || "#333";
    panel.style.display = "block";
    // accessibility: remember the opener and move focus into the dialog so it can be
    // dismissed by keyboard (Escape / the close button), focus is restored on close
    panel._opener = document.activeElement;
    var closeBtn = panel.querySelector(".bi-close");
    if (closeBtn) closeBtn.focus();
  }
  // expose so the HTML segment legend can open the same info box on click
  if (typeof window !== "undefined") window.radarShowInfo = showInfo;

  // draw blips on radar
  var blips = rink.selectAll(".blip")
    .data(config.entries)
    .enter()
      .append("g")
        .attr("class", "blip")
        .attr("id", function(d) { return "blip" + d.id; })
        .attr("transform", function(d, i) { return legend_transform(d.quadrant, d.ring, config.legend_column_width, i); })
        .style("cursor", "pointer")
        .on("mouseover", function(event, d) { showBubble(d); highlightLegendItem(d); })
        .on("mouseout", function(event, d) { hideBubble(d); unhighlightLegendItem(d); })
        .on("click", function(event, d) {
          event.preventDefault();
          // overview: a blip click zooms into its segment; zoomed in: it shows details
          if (config.segment_zoom && currentZoom === null) { zoomToSegment(d.quadrant); }
          else { showInfo(d); }
        });

  // configure each blip
  blips.each(function(d) {
    var blip = d3.select(this);

    // blip link
    if (d.active && Object.prototype.hasOwnProperty.call(d, "link") && d.link) {
      blip = blip.append("a")
        .attr("xlink:href", d.link);

      if (config.links_in_new_tabs) {
        blip.attr("target", "_blank");
      }
    }

    // blip shape (the thin white outline that keeps blips legible over the tinted
    // segments, and the hover highlight, live in radar.css via the .blip selector)
    if (d.moved == 1) {
      blip.append("path")
        .attr("d", "M -11,5 11,5 0,-13 z") // triangle pointing up
        .style("fill", d.color);
    } else if (d.moved == -1) {
      blip.append("path")
        .attr("d", "M -11,-5 11,-5 0,13 z") // triangle pointing down
        .style("fill", d.color);
    } else if (d.moved == 2) {
      blip.append("path")
        .attr("d", d3.symbol().type(d3.symbolStar).size(200))
        .style("fill", d.color);
    } else {
      blip.append("circle")
        .attr("r", 9)
        .attr("fill", d.color);
    }

    // blip text
    if (d.active || config.print_layout) {
      var blip_text = config.print_layout ? d.id : d.label.match(/[a-z]/i);
      blip.append("text")
        .text(blip_text)
        .attr("y", 3)
        .attr("text-anchor", "middle")
        .style("fill", contrastText(d.color))
        .style("font-family", config.font_family)
        .style("font-size", function(d) { return blip_text.length > 2 ? "8px" : "9px"; })
        .style("pointer-events", "none")
        .style("user-select", "none");
    }
  });

  // make sure that blips stay inside their segment
  function ticked() {
    blips.attr("transform", function(d) {
      return translate(d.segment.clipx(d), d.segment.clipy(d));
    })
  }

  // distribute blips, while avoiding collisions
  d3.forceSimulation()
    .nodes(config.entries)
    .velocityDecay(0.19) // magic number (found by experimentation)
    .force("collision", d3.forceCollide().radius(13).strength(0.85))
    .on("tick", ticked);

  function ringDescriptionsTable() {
    var table = d3.select("body").append("table")
      .attr("class", "radar-table")
      .style("border-collapse", "collapse")
      .style("position", "relative")
      .style("top", "-70px")  // Adjust this value to move the table closer vertically
      .style("margin-left", "50px")
      .style("margin-right", "50px")
      .style("font-family", config.font_family)
      .style("font-size", "13px")
      .style("text-align", "left");

    var thead = table.append("thead");
    var tbody = table.append("tbody");

    // define fixed width for each column
    var columnWidth = `${100 / config.rings.length}%`;

    // create table header row with ring names
    var headerRow = thead.append("tr")
      .style("border", "1px solid #ddd");

    headerRow.selectAll("th")
      .data(config.rings)
      .enter()
      .append("th")
      .style("padding", "8px")
      .style("border", "1px solid #ddd")
      .style("background-color", d => d.color)
      .style("color", "#fff")
      .style("width", columnWidth)
      .text(d => d.name);

    // create table body row with descriptions
    var descriptionRow = tbody.append("tr")
      .style("border", "1px solid #ddd");

    descriptionRow.selectAll("td")
      .data(config.rings)
      .enter()
      .append("td")
      .style("padding", "8px")
      .style("border", "1px solid #ddd")
      .style("width", columnWidth)
      .text(d => d.description);
  }

  if (config.print_ring_descriptions_table) {
    ringDescriptionsTable();
  }
}
