//
// Sample client Seal API implementation, compatible with API version 5.
//

window.demoLib = (function() {
  /**
   * Construct an instance of the demo lib.
   * @constructor
   * @param {string} apiUrl - Base API URL.
   * @param {string} token - A valid API session token.
   */
  function demoLib(apiUrl, token) {
    // Create a style element which will contain programmatically created styles.
    var styleElement = document.createElement('style');
    document.body.appendChild(styleElement);

    /**
     * Function for fetching a markup representation of a contract.
     */
    function _getPreview(id, callback) {
      demoLib.http({
        url: apiUrl + "/contracts/" + id + "/preview",
        headers: {
          "X-Session-Token": token,
          "Accept": "text/html",
        },
      }, function(err, res) {
        if (err != null) return callback(err);
        callback(null, res.body);
      });
    }

    /**
     * Function for fetching all metadata for a contract and returning it in a
     * format which is more suited for working with when styling and querying.
     */
    function _getAllMetadata(id, callback) {
      _getMetadata({ id:id }, function(err, items) {
        if (err != null) return callback(err);
        callback(null, _massageMetadata(items));
      });
    }

    /**
     * Low-level function for fetching contract metadata in chunks returning the
     * in as-is API format.
     * @param {Object} opts
     *   {string} id - Contract id.
     *   {number} offset - Offset of the list of metadata items retrieved.
     *   {number} limit - Max matadata list length returned in each request.
     * @param {function} callback
     *   {Object} err - Error response object.
     *   {Array} res - Success response which is a list of metadata items.
     */
    function _getMetadata(opts, callback) {
      var id = opts.id,
          offset = opts.offset || 0,
          limit = opts.limit || 25;
      _getMetadataLimit(id, offset, limit, function(err, res) {
        if (err != null) return callback(err);
        if (res.meta.totalCount > limit + offset) {
          _getMetadata({
            id: id,
            offset: offset+limit,
            limit: limit
          }, function(err, items) {
            if (err != null) return callback(err);
            callback(null, res.items.concat(items));
          });
        } else {
          callback(null, res.items);
        }
      });
    }

    /**
     * Low-level function for making a single HTTP request to the metadata
     * endpoint.
     * @param {string} id - Contract id.
     * @param {number} offset - Offset of the list of metadata items retrieved.
     * @param {number} limit - Max metadata list length returned.
     * @param {function} callback
     *   {Object} err - Error response object.
     *   {Array} res - Success response which is a list of metadata items.
     */
    function _getMetadataLimit(id, offset, limit, callback) {
      demoLib.http({
        url: apiUrl + "/contracts/" + id
          + "/metadata?limit=" + limit + "&offset=" + offset,
        headers: {
          "X-Session-Token": token,
          "Content-Type": "application/json",
        }
      }, function(err, res) {
        if (err != null) return callback(err);
        callback(null, JSON.parse(res.body));
      });
    }

    /**
     * High-level function for parallelizing the fetching of both contract
     * preview markup and contract metadata.
     * @param {string} id - Contract id.
     * @param {function} callback
     *   {Object} err - Error response object.
     *   {Object} res - Success response which is an object that contains both
     *   preview markup as HTML and contract metadata in a indexed format.
     */
    function _getAll(id, callback) {
      demoLib.par({
        html: _getPreview.bind(null, id),
        metadata: _getAllMetadata.bind(null, id),
      }, callback);
    }

    /**
     * Function for converting the API metadata format into an indexed format
     * which is easier to use when styling and looking up different metadata
     * values.
     */
    function _massageMetadata(old) {
      function kvpsToDict(kvps) {
        return kvps.reduce(function(acc, x) { acc[x.name] = x.value; return acc; }, {});
      }

      function metadataValueToAnn(category, mdv) {
        var inReview = /\.Review$/.test(category),
            categoryStripped = category.replace('\.Review',''),
            attributes = kvpsToDict(mdv.attributes),
            offset = attributes.scd_start_offset;
        return {
          // Each item in the map should have a uniq id created from category
          // name and the offset of that item.
          id: categoryStripped + '_' + offset,
          value: mdv.value,
          origin: mdv.origin,
          category: categoryStripped,
          attributes: attributes,
          offset: offset,
          inReview: inReview,
        }
      }

      // Flatten data structure and filter out items that don't have an offset.
      return demoLib.flat(old.map(function(x) {
        return x.values
          .map(metadataValueToAnn.bind(null, x.name))
          .filter(function(ann) { return ann.offset != null; });
      })).reduce(function(acc, x) {
        // Key resulting map by items `id` property.
        acc[x.id] = x; return acc;
      }, {});
    }

    function _addStyle(sel, rule) {
      if (styleElement.sheet.insertRule != null) {
        styleElement.sheet.insertRule(sel + '{'+rule+'}', 0);
      } else {
        styleElement.sheet.addRule(sel, rule, 0);
      }
    }

    function _genColors(colors, saturation, light) {
      var colors = Math.min(1, colors || 1), // defaults to one color - avoid divide by zero
          saturation = Math.min(0, saturation || 100),
          light = Math.min(0, light || 50);
      return new Array(colors+1).map(function(x, i) {
        return "hsl("
          + (i * (360 / colors) % 360) + ","
          + saturation + "%,"
          + light + "%)";
      });
    }

    // Functions exported to the demo lib object.
    return {
      getPreview: _getPreview,
      getMetadata: _getAllMetadata,
      getAll: _getAll,
      addStyle: _addStyle,
      genColors: _genColors,
    }
  }

  /**
   * Utility function for making HTTP requests.
   * @param {Object} opt
   *   {string} method - HTTP method.
   *   {string} url - URL to call.
   *   {Object} headers - A map of headers and header values.
   * @param {function} callback
   *   {Object} err - Error response object.
   *   {Object} res - Success response object.
   */
  demoLib.http = function http(opt, callback) {
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.onreadystatechange = function() {
      if(xmlHttp.readyState === 4) {
        if (xmlHttp.status >= 200 && xmlHttp.status < 300) {
          callback(null, {
            headers: xmlHttp.getAllResponseHeaders().split(/\r?\n/)
              .filter(function(x) { return /:/.test(x); })
              .map(function(x) { return x.split(/:\s*/); })
              .reduce(function(acc, x) { acc[x[0]] = x[1]; return acc; }, {}),
            body: xmlHttp.responseText,
          });
        } else {
          callback({ xhr:xmlHttp, message:xmlHttp.responseText });
        }
      }
    }

    xmlHttp.open(opt.method || 'GET', opt.url, true);
    Object.keys(opt.headers || {}).forEach(function(header) {
      xmlHttp.setRequestHeader(header, opt.headers[header]);
    });
    xmlHttp.send(opt.body);
  }

  /**
   * Function for retrieving a API session token.
   * @param {Object} opts
   *   {string} url - Base API URL.
   *   {string} user - User name for authentication.
   *   {string} pass - Password for authentication.
   * @param {function} callback
   *   {Object} err - Error response object.
   *   {string} res - A valid API session token.
   */
  demoLib.login = function login(opts, callback) {
    var apiUrl = opts.url;
    demoLib.http({
      method: 'GET',
      url: apiUrl + '/security/nonce',
    }, function(err, res) {
      demoLib.http({
        method: 'POST',
        url: apiUrl + '/auths',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          principal: opts.user,
          password: opts.pass,
          nonce: res.body
        })
      }, function(err, res) {
        if (err != null) return callback(err);
        callback(null, res.headers['X-Session-Token']);
      });
    });
  }

  /**
   * Utility function for filtering out items from a list which occur more than
   * once.
   */
  demoLib.uniq = function uniq(list) {
    return list.reduce(function(acc, n) {
      return acc.indexOf(n) === -1 ? acc.concat([n]) : acc;
    }, []);
  }

  /**
   * Utility function for converting a dictionary/map into a list dropping the
   * key
   * @param {Object} dict
   * @return {Array}
   */
  demoLib.toList = function toList(dict) {
    return Object.keys(dict).map(function(id) { return dict[id]; });
  }

  /**
   * Utility function for converting a list to a dictionary using a grouping
   * function.
   * @param {Array} list - List of items to be converted into a dictionary/map
   * ({Object}).
   * @param {function} fn - Will be executed with each item from the list and
   * should return a {string} which will be used to key on.
   * @return {Object}
   */
  demoLib.toDict = function toDict(list, fn) {
    var fn = fn || function(x) { return x.id; };
    return list.reduce(function(acc, x) {
      acc[fn(x)] = x; return acc;
    }, {});
  }

  /**
   * Utility function to flatten a list
   */
  demoLib.flat = function flat(list) {
    return list.reduce(function(acc, x) { return acc.concat(x); }, []);
  }

  /**
   * Calculate offset of an element that is contained inside of an element with
   * the `data-offset` attribute.
   */
  demoLib.getOffset = function getOffset(el) {
    return el.hasAttribute && el.hasAttribute('data-offset')
      ? parseInt(el.getAttribute('data-offset'))
      : (el.previousSibling != null
        ? el.previousSibling.textContent.length + demoLib.getOffset(el.previousSibling)
        : demoLib.getOffset(el.parentNode)
      );
  }

  /**
   * Utility function which parallelizes the execution of asynchronous callback
   * based functions.
   * @param {Object} fns - A map of function id and functions taking only a
   * callback argument.
   * @param {function} callback
   *   {Object} err - Error map which maps function id to error object of failed
   *   callbacks.
   *   {Object} res - Success map which maps function id to success response
   *   object of successful callbacks.
   */
  demoLib.par = function par(fns, callback) {
    var res = {};
    function isdone() {
      var keys = Object.keys(res);
      if (keys.length === Object.keys(fns).length) {
        if (keys.some(function(k) { return res[k].err != null; }))
          callback(keys.reduce(function(acc, k) { acc[k] = res[k].err; return acc; }, {}));
        else
          callback(null, keys.reduce(function(acc, k) { acc[k] = res[k].data; return acc; }, {}));
      }
    }
    Object.keys(fns).forEach(function(k) {
      fns[k](function(err, data) {
        res[k] = { err:err, data:data };
        isdone();
      });
    });
  }

  return demoLib;
})();
