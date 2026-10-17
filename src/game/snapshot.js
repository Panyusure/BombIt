/* Lossless JSON snapshots: preserve typed-array metadata and shared references. */
(function (BI) {
  'use strict';
  var VERSION = 1;
  var OMIT = { rng: true, eventSink: true, events: true, danger: true,
    _aiField: true, _aiBreakField: true, asset: true };
  BI.snapshot = {
    save: function (world) {
      var nodes = [], seen = new Map();
      function encode(value) {
        if (value === undefined) return { undefined: true };
        if (typeof value === 'number' && !Number.isFinite(value)) return { number: String(value) };
        if (value === null || typeof value !== 'object') return value;
        if (seen.has(value)) return { ref: seen.get(value) };
        var id = nodes.length, node = { type: 'object', entries: [] };
        seen.set(value, id); nodes.push(node);
        if (ArrayBuffer.isView(value)) {
          node.type = value.constructor.name;
          node.data = Array.from(value);
        } else if (Array.isArray(value)) node.type = 'array';
        Object.keys(value).forEach(function (key) {
          if ((value === world && OMIT[key]) || key === 'asset' || typeof value[key] === 'function') return;
          if (node.data && /^(0|[1-9][0-9]*)$/.test(key)) return;
          node.entries.push([key, encode(value[key])]);
        });
        return { ref: id };
      }
      var root = encode(world);
      return { version: VERSION, rngState: world.rng.getState(), root: root, nodes: nodes };
    },
    load: function (snapshot) {
      if (!snapshot || snapshot.version !== VERSION) throw new Error('Unsupported snapshot version');
      var constructors = { Uint8Array: Uint8Array, Float32Array: Float32Array, Int16Array: Int16Array,
        Uint32Array: Uint32Array, Int32Array: Int32Array, Float64Array: Float64Array };
      var values = snapshot.nodes.map(function (node) {
        if (node.type === 'array') return [];
        if (node.type === 'object') return {};
        if (!constructors[node.type]) throw new Error('Unsupported snapshot node type');
        return new constructors[node.type](node.data);
      });
      function decode(value) {
        if (value && typeof value === 'object') {
          if (Object.prototype.hasOwnProperty.call(value, 'ref')) return values[value.ref];
          if (value.undefined) return undefined;
          if (value.number) return Number(value.number);
        }
        return value;
      }
      snapshot.nodes.forEach(function (node, i) {
        node.entries.forEach(function (pair) {
          Object.defineProperty(values[i], pair[0], { value: decode(pair[1]), enumerable: true, writable: true, configurable: true });
        });
      });
      var w = decode(snapshot.root);
      w.rng = BI.makeRng(1).setState(snapshot.rngState);
      w.events = []; w.danger = null; w.eventSink = null;
      w._aiField = null; w._aiBreakField = null;
      return BI.engine.attach(w);
    }
  };
})(window.BI = window.BI || {});
