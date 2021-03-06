/* ---------------------------------------------------------------------------
         d8888 8888888 8888888b.  888      .d88888b.   .d8888b.  888    d8P
        d88888   888   888   Y88b 888     d88P" "Y88b d88P  Y88b 888   d8P
       d88P888   888   888    888 888     888     888 888    888 888  d8P
      d88P 888   888   888   d88P 888     888     888 888        888d88K
     d88P  888   888   8888888P"  888     888     888 888        8888888b
    d88P   888   888   888 T88b   888     888     888 888    888 888  Y88b
   d8888888888   888   888  T88b  888     Y88b. .d88P Y88b  d88P 888   Y88b
  d88P     888 8888888 888   T88b 88888888 "Y88888P"   "Y8888P"  888    Y88b
------------------------------------------------------------------------------

Airlock v0.1.0
(c) 2013 by Search Discovery <http://searchdiscovery.com/>


airlock.js may be freely distributed under the MIT license.

For all details and documentation: http://www.searchdiscovery.com/airlock


----------------------------------------------------------------------------*/
(function (window, document, undefined) {

  // First thing's first; load the new hotness.
  (function(a, i, r, l, o, c, k) {
    a.GoogleAnalyticsObject = o;
    a[o] = a[o] || (function() {
      (a[o].q = a[o].q || []).push(arguments);
    });
    a[o].l = 1 * (new Date());
    c = i.createElement(r);
    k = i.getElementsByTagName(r)[0];
    c.async = 1;
    c.src = l;
    k.parentNode.insertBefore(c, k);
  })(window, document, 'script', '//www.google-analytics.com/analytics.js', 'ga');

  var _gaq = window._gaq,
      rx = {
        actions: /^([\w\d_-]+)?\.?(_track(Event|Pageview|Trans|Social|Timing)|_add(Item|Trans)|_set(CustomVar|Account|DomainName|AllowLinker|SampleRate|CookiePath)?|_link|_require)$/,
        setupActions: /^(.+\.)?_(set(Account|CustomVar|DomainName|AllowLinker|SampleRate|CookiePath)?)$/,
        ecommerceActions: /^(.+\.)?_(add(Trans|Item)|trackTrans)$/,
        writeableSet: /^page|title$/
      }, i, ln;

  var Store = function () {
    this._contents = {};
    this._defaultKey = '__default__';
  };
  Store.prototype.get = function (key) {
    key = key || this._defaultKey;
    return this._contents[key];
  };
  Store.prototype.set = function (key, val) {
    key = key || this._defaultKey;
    this._contents[key] = val;
    return this;
  };
  Store.prototype.each = function (func, context) {
    for (var key in this._contents) {
      func.call(context, this._contents[key], key, this._contents);
    }
  };

  // Each spaceship represents a tracker namespace.
  var SpaceShip = function (options) {
    this.settings = {};
    this._settings = {};
    this.account = options.account;
    this.namespace = options.namespace;
    this.setupQueue = [];
    this.settings.name = this.namespace;
  };

  var Airlock = {};

  Airlock.spaceships = new Store();

  Airlock.readAction = function (actionName) {
    var match = actionName.match(rx.actions);
    return {
      namespace: match[1],
      action: match[2]
    };
  };

  Airlock.initialize = function () {
    var newQ = [], action, spaceship;

    // loop through _gaq to strip out setup calls
    for (i = 0, ln = _gaq.length; i < ln; i++) {
      spaceship = null;
      action = Airlock.readAction(_gaq[i][0]);

      if (/_setAccount/.test(action.action)) {
        spaceship = new SpaceShip({
          namespace: action.namespace,
          account: _gaq[i][1]
        });
        this.dock(spaceship);
        continue;
      }
      if (rx.setupActions.test(action.action)) {
        this.pressurize(this.spaceships.get(action.namespace), _gaq[i]);
        continue;
      }
      newQ.push(_gaq[i]);
    }
    Array.prototype.splice.apply(window._gaq, [0, _gaq.length].concat(newQ));

    this.spaceships.each(function (spaceship) {
      Airlock.open(spaceship, [
        'create',
        spaceship.account,
        spaceship.settings
      ]);
    });

    // No need to do anything fancy here. Setting an instance method
    // `push()` on the global `_gaq` variable will intercept any calls
    // to `_gaq.prototype.push()`
    window._gaq.push = function (args) {
      var action = args[0];
      // Ensure users are sending a valid action, otherwise do nothing.
      if (!rx.actions.test(action)) { return; }

      // If the user is trying to setup/send an ecommerce action
      if (rx.ecommerceActions.test(action) && !Airlock.ecommerceInitialized) {
        Airlock.ecommerceInitialized = true;
        window.ga('require', 'ecommerce', 'ecommerce.js');
      }
      var spaceship = Airlock.spaceships.get(Airlock.readAction(action).namespace);

      if (!spaceship) { return; }
      args = Airlock.pressurize(spaceship, args);
      Airlock.open(spaceship, args);
    };

    for (i = 0, ln = _gaq.length; i < ln; i++) {
      _gaq.push(_gaq[i]);
    }
  };

  // Add tracker to Airlock, push settings to ga
  Airlock.dock = function (spaceship) {
    this.spaceships.set(spaceship.namespace, spaceship);
  };

  // Once our arguments are "pressurized", send them off to `ga()`
  Airlock.open = function (spaceship, args) {
    if (args) {
      args[0] = !spaceship.namespace || args[0] === 'create' ?
        args[0] :
        [spaceship.namespace, args[0]].join('.');

      window.ga.apply(window, args);
    }
  };

  Airlock.pressurize = function (spaceship, args) {
    var conversion = Airlock.conversions[args.splice(0,1)[0].replace(rx.actions, "$2")];
    if (!conversion) { return; }

    if (typeof conversion === 'function') {
      return conversion.apply(spaceship, args);
    }

    var index = {}, out = [],
        i = 0, ln = args.length < conversion.input.length ?
          args.length :
          conversion.input.length;

    // build an index to match input labels to input values
    for (; i < ln; i++) {
      index[conversion.input[i]] = args[i];
    }

    // loop through outputs and permute values as necessary
    i = 0; ln = conversion.output.length;
    for (; i < ln; i++) {
      var val = permute(conversion.output[i], index);
      if (val) {
        out.push(val);
      }
    }
    return out;
  };

  var permute = function (template, data) {
    if (typeof template === 'function') {
      return template(data);
    }
    var templMatch = template.match(/\[\[([a-zA-Z_]+)\]\]/);
    if (templMatch) {
      if (!data[templMatch[1]]) { return; }
      // if there is no input value corresponding to the template identifier
      // (i.e., if this is an optional value), this will return undefined
      // and will be ignored.
      return template.replace(templMatch[0], data[templMatch[1]]);
    }
    return template;
  };

  var passthru = function (arg) { return arg; };

  Airlock.conversions = {
    // Setup actions
    _setSampleRate: function (rate) {
      this.settings.sampleRate = rate;
    },
    _setCookiePath: function (path) {
      this.settings.cookiePath = path;
    },
    _set: function (key, val) {
      this.settings[key.replace('ua', 'cookie')] = val;

      if (rx.writeableSet.test(key)) {
        return ['set',key,val];
      }
    },
    _setDomainName: function (domainName) {
      this._settings.domainName = domainName;
    },
    _setAllowLinker: function (allow) {
      var that = this;
      this.settings.allowLinker = allow;
      this.setupQueue.push(function () {
        window.ga('require', 'linker');
        Airlock.open(that, ['linker:autoLink', that._settings.domainName]);
      });
    },
    // Enhanced Link Attribution
    _require: function (type){
      if (type === 'inpage_linkid') {
        return ['require','linkid','linkid.js'];
      }
    },

    // Custom Variables
    _setCustomVar: {
      input: ['slot', 'name', 'value'],
      output: ['set', 'dimension[[slot]]', '[[value]]']
    },

    // Tracking actions
    _trackEvent: {
      input: ['eventCategory', 'eventAction', 'eventLabel', 'eventValue', 'nonInteraction'],
      output: ['send', 'event', passthru]
    },
    _trackPageview: {
      input: ['pagePath'],
      output: ['send', 'pageview', '[[pagePath]]']
    },
    _trackTiming: {
      input: ['timingCategory', 'timingVar', 'timingValue', 'timingLabel'],
      output: ['send', 'timing', passthru]
    },
    _trackSocial: {
      input: ['socialNetwork', 'socialAction', 'socialTarget', 'page'],
      output: ['send', 'social', passthru]
    },

    // Ecommerce
    _addTrans: {
      input: ['id', 'affiliation', 'revenue', 'tax', 'shipping'],
      output: ['ecommerce:addTransaction', passthru]
    },
    _addItem: {
      input: ['id', 'sku', 'name', 'category', 'price', 'quantity'],
      output: ['ecommerce:addItem', passthru]
    },
    _trackTrans: {
      input: [],
      output: ['ecommerce:send']
    }
  };

  Airlock.initialize();
  window.Airlock = Airlock;
})(window, document);
