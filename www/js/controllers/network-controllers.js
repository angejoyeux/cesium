
angular.module('cesium.network.controllers', ['cesium.services'])

.config(function($stateProvider) {
  'ngInject';

  $stateProvider

    .state('app.network', {
      url: "/network?type&expert",
      cache: false,
      views: {
        'menuContent': {
          templateUrl: "templates/network/view_network.html",
          controller: 'NetworkLookupCtrl'
        }
      },
      data: {
        silentLocationChange: true
      }
    })

    .state('app.view_peer', {
      url: "/network/peer/:server?ssl&tor",
      cache: false,
      views: {
        'menuContent': {
          templateUrl: "templates/network/view_peer.html",
          controller: 'PeerViewCtrl'
        }
      },
      data: {
        preferHttp: true // avoid HTTPS if config has httpsMode=clever
      }
    });
})

.controller('NetworkLookupCtrl', NetworkLookupController)

.controller('PeerViewCtrl', PeerViewController)

.controller('NetworkLookupModalCtrl', NetworkLookupModalController)

.controller('NetworkLookupPopoverCtrl', NetworkLookupPopoverController)

.controller('PeerInfoPopoverCtrl', PeerInfoPopoverController)

;

function NetworkLookupController($scope,  $state, $location, $ionicPopover, $window, $translate,
                                 BMA, UIUtils, csConfig, csSettings, csCurrency, csNetwork, csWot) {
  'ngInject';

  $scope.networkStarted = false;
  $scope.ionItemClass = '';
  $scope.expertMode = csSettings.data.expertMode && !UIUtils.screen.isSmall();
  $scope.isHttps = ($window.location.protocol === 'https:');
  $scope.search = {
    text: '',
    loading: true,
    type: undefined,
    results: [],
    endpointFilter: null,
    sort : undefined,
    asc: true
  };
  $scope.helptipPrefix = 'helptip-network';
  $scope.eanbleLocationHref = true; // can be overrided by sub-controler (e.g. popup)

  /**
   * Enter in view
   */
  $scope.enter = function(e, state) {
    if ($scope.networkStarted) return;
    $scope.networkStarted = true;
    $scope.search.loading = true;
    csCurrency.get()
      .then(function (currency) {
        if (currency) {
          $scope.node = !BMA.node.same(currency.node.host, currency.node.port) ?
            BMA.instance(currency.node.host, currency.node.port) : BMA;
          if (state && state.stateParams) {
            if (state.stateParams.type && ['mirror', 'member', 'offline'].indexOf(state.stateParams.type) != -1) {
              $scope.search.type = state.stateParams.type;
            }
            if (state.stateParams.expert) {
              $scope.expertMode = (state.stateParams.expert == 'true');
            }
          }
          $scope.load();
        }
      })
      .catch(function(err) {
        UIUtils.onError('ERROR.GET_CURRENCY_FAILED')(err);
        $scope.networkStarted = false;
      });
  };
  $scope.$on('$ionicParentView.enter', $scope.enter);

  /**
   * Leave the view
   */
  $scope.leave = function() {
    if (!$scope.networkStarted) return;
    csNetwork.close();
    $scope.networkStarted = false;
    $scope.search.loading = true;
  };
  $scope.$on('$ionicView.beforeLeave', $scope.leave);
  $scope.$on('$ionicParentView.beforeLeave', $scope.leave);
  $scope.$on('$destroy', $scope.leave);

  $scope.computeOptions = function() {
    var options = {
      filter: {
        member: (!$scope.search.type || $scope.search.type === 'member'),
        mirror: (!$scope.search.type || $scope.search.type === 'mirror'),
        endpointFilter : (angular.isDefined($scope.search.endpointFilter) ? $scope.search.endpointFilter : null),
        online: !($scope.search.type && $scope.search.type === 'offline')
      },
      sort: {
        type : $scope.search.sort,
        asc : $scope.search.asc
      },
      expertMode: $scope.expertMode,
      // larger timeout when on expert mode
      timeout: csConfig.timeout && ($scope.expertMode ? (csConfig.timeout / 10) : (csConfig.timeout / 100))
    };
    return options;
  };

  $scope.load = function() {

    if ($scope.search.loading){
      csNetwork.start($scope.node, $scope.computeOptions());

      // Catch event on new peers
      $scope.refreshing = false;
      csNetwork.api.data.on.changed($scope, function(data){
        if (!$scope.refreshing) {
          $scope.refreshing = true;
          csWot.extendAll(data.peers)
            .then(function() {
              // Avoid to refresh if view has been leaving
              if ($scope.networkStarted) {
                $scope.updateView(data);
              }
              $scope.refreshing = false;
            });
        }
      });
    }

    // Show help tip
    $scope.showHelpTip();
  };

  $scope.updateView = function(data) {
    console.debug("[peers] Updating UI");
    $scope.$broadcast('$$rebind::' + 'rebind'); // force data binding
    $scope.search.results = data.peers;
    $scope.search.memberPeersCount = data.memberPeersCount;
    // Always tru if network not started (e.g. after leave+renter the view)
    $scope.search.loading = !$scope.networkStarted || csNetwork.isBusy();
    if ($scope.motion && $scope.search.results && $scope.search.results.length > 0) {
      $scope.motion.show({selector: '.item-peer'});
    }
    if (!$scope.loading) {
      $scope.$broadcast('$$rebind::' + 'rebind'); // force data binding
    }
  };

  $scope.refresh = function() {
    // Network
    $scope.search.loading = true;
    csNetwork.loadPeers();
  };

  $scope.sort = function() {
    $scope.search.loading = true;
    $scope.refreshing = true;
    csNetwork.sort($scope.computeOptions());
    $scope.updateView(csNetwork.data);
  };

  $scope.toggleSearchType = function(type){
    $scope.hideActionsPopover();
    if ($scope.search.type === type || type === 'none') {
      $scope.search.type = undefined;
    }
    else {
      $scope.search.type = type;
    }
    csNetwork.close();
    $scope.search.loading = true;
    $scope.load();

    // Update location href
    if ($scope.eanbleLocationHref) {
      $location.search({type: $scope.search.type}).replace();
    }
  };

  $scope.toggleSearchEndpoint = function(endpoint){
    $scope.hideActionsPopover();
    if ($scope.search.endpointFilter === endpoint || endpoint === null) {
      $scope.search.endpointFilter = null;
    }
    else {
      $scope.search.endpointFilter = endpoint;
    }
    $scope.sort();
  };

  $scope.toggleSort = function(sort){
    if ($scope.search.sort === sort && !$scope.search.asc) {
      $scope.search.asc = undefined;
      $scope.search.sort = undefined;
    }
    else {
      $scope.search.asc = ($scope.search.sort === sort) ? !$scope.search.asc : true;
      $scope.search.sort = sort;
    }
    $scope.sort();
  };

  $scope.selectPeer = function(peer) {
    // Skipp offline or WS2P node
    if (!peer.online || peer.isWs2p()) return;

    var stateParams = {server: peer.getServer()};
    if (peer.isSsl()) {
      stateParams.ssl = true;
    }
    if (peer.isTor()) {
      stateParams.tor = true;
    }
    $state.go('app.view_peer', stateParams);
  };

  $scope.$on('csView.action.refresh', function(event, context) {
    if (context == 'peers') {
      $scope.refresh();
    }
  });

  $scope.$on('csView.action.showActionsPopover', function(event, clickEvent) {
    $scope.showActionsPopover(clickEvent);
  });

  /* -- popover -- */

  $scope.showActionsPopover = function(event) {
    if (!$scope.actionsPopover) {
      $ionicPopover.fromTemplateUrl('templates/network/lookup_popover_actions.html', {
        scope: $scope
      }).then(function(popover) {
        $scope.actionsPopover = popover;
        //Cleanup the popover when we're done with it!
        $scope.$on('$destroy', function() {
          $scope.actionsPopover.remove();
        });
        $scope.actionsPopover.show(event);
      });
    }
    else {
      $scope.actionsPopover.show(event);
    }
  };

  $scope.hideActionsPopover = function() {
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
    }
  };

  $scope.showEndpointsPopover = function($event, peer, endpointFilter) {
    var endpoints = peer.getEndpoints(endpointFilter);
    endpoints = (endpoints||[]).reduce(function(res, ep) {
        var bma = BMA.node.parseEndPoint(ep);
        return res.concat({
          label: 'NETWORK.VIEW.NODE_ADDRESS',
          value: peer.getServer() + (bma.path||'')
        });
      }, []);
    if (!endpoints.length) return;

    UIUtils.popover.show($event, {
      templateUrl: 'templates/network/popover_endpoints.html',
      bindings: {
        titleKey: 'NETWORK.VIEW.ENDPOINTS.' + endpointFilter,
        items: endpoints
      }
    });
    $event.stopPropagation();
  };

  $scope.showWs2pPopover = function($event, peer) {
    $event.stopPropagation();

    return $translate('NETWORK.VIEW.PRIVATE_ACCESS')
      .then(function(privateAccessMessage) {
        UIUtils.popover.show($event, {
          templateUrl: 'templates/network/popover_endpoints.html',
          bindings: {
            titleKey: 'NETWORK.VIEW.ENDPOINTS.WS2P',
            valueKey: 'NETWORK.VIEW.NODE_ADDRESS',
            items: [
              {
                label: 'NETWORK.VIEW.NODE_ADDRESS',
                value: !peer.bma.private ? (peer.getServer() + (peer.bma.path||'')) : privateAccessMessage
              },
              {
                label: 'NETWORK.VIEW.WS2PID',
                value: peer.bma.ws2pid
              },
              {
                label: 'NETWORK.VIEW.POW_PREFIX',
                value: peer.powPrefix
              }]
            }
          });
      });
  };



  /* -- help tip -- */

  // Show help tip
  $scope.showHelpTip = function(index, isTour) {
    index = angular.isDefined(index) ? index : csSettings.data.helptip.network;
    isTour = angular.isDefined(isTour) ? isTour : false;
    if (index < 0) return;

    // Create a new scope for the tour controller
    var helptipScope = $scope.createHelptipScope();
    if (!helptipScope) return; // could be undefined, if a global tour already is already started
    helptipScope.tour = isTour;

    return helptipScope.startNetworkTour(index, false)
      .then(function(endIndex) {
        helptipScope.$destroy();
        if (!isTour) {
          csSettings.data.helptip.network = endIndex;
          csSettings.store();
        }
      });
  };
}


function NetworkLookupModalController($scope, $controller, parameters) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('NetworkLookupCtrl', {$scope: $scope}));

  // Read parameters
  parameters = parameters || {};
  $scope.enableFilter = angular.isDefined(parameters.enableFilter) ? parameters.enableFilter : true;
  $scope.search.type = angular.isDefined(parameters.type) ? parameters.type : $scope.search.type;
  $scope.search.endpointFilter = angular.isDefined(parameters.endpointFilter) ? parameters.endpointFilter : $scope.search.endpointFilter;
  $scope.expertMode = angular.isDefined(parameters.expertMode) ? parameters.expertMode : $scope.expertMode;
  $scope.ionItemClass = parameters.ionItemClass || 'item-border-large';
  $scope.eanbleLocationHref = false;
  $scope.helptipPrefix = '';

  $scope.selectPeer = function(peer) {
    $scope.closeModal(peer);
  };

  $scope.$on('modal.hidden', function(){
    $scope.leave();
  });

  // Disable this unsed method - called by load()
  $scope.showHelpTip = function() {};

  // Enter the modal
  $scope.enter();
}


function NetworkLookupPopoverController($scope, $controller) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('NetworkLookupCtrl', {$scope: $scope}));

  // Read parameters
  var parameters = parameters || {};
  $scope.enableFilter = angular.isDefined(parameters.enableFilter) ? parameters.enableFilter : true;
  $scope.search.type = angular.isDefined(parameters.type) ? parameters.type : $scope.search.type;
  $scope.search.endpointFilter = angular.isDefined(parameters.endpointFilter) ? parameters.endpointFilter : $scope.search.endpointFilter;
  $scope.expertMode = angular.isDefined(parameters.expertMode) ? parameters.expertMode : $scope.expertMode;
  $scope.ionItemClass = parameters.ionItemClass || 'item-border-large';
  $scope.helptipPrefix = '';

  $scope.selectPeer = function(peer) {
    $scope.closePopover(peer);
  };

  $scope.$on('popover.hidden', function(){
    $scope.leave();
  });

  // Disable this unsed method - called by load()
  $scope.showHelpTip = function() {};

  // Enter the popover
  $scope.enter();
}

function PeerInfoPopoverController($scope, $q, csSettings, csCurrency, csHttp, BMA) {
  'ngInject';

  $scope.loading = true;
  $scope.formData = {};

  $scope.load = function() {

    $scope.loading = true;
    $scope.formData = {};

    return $q.all([
      // get current block
      csCurrency.blockchain.current()
        .then(function(block) {
          $scope.formData.number = block.number;
          $scope.formData.medianTime = block.medianTime;
          $scope.formData.powMin = block.powMin;
          $scope.formData.useSsl = BMA.useSsl;
        })
        .catch(function() {
          delete $scope.formData.number;
          delete $scope.formData.medianTime;
          delete $scope.formData.powMin;
          delete $scope.formData.useSsl;
          // continue
        }),

      // Get node current version
      BMA.node.summary()
        .then(function(res){
          console.log(res);
          $scope.formData.version = res && res.duniter && res.duniter.version;
          $scope.formData.software = res && res.duniter && res.duniter.software;
        })
        .catch(function() {
          delete $scope.formData.version;
          delete $scope.formData.software;
          // continue
        }),

      // Get duniter latest version
      BMA.version.latest()
        .then(function(latestRelease){
          $scope.formData.latestRelease = latestRelease;
        })
        .catch(function() {
          delete $scope.formData.latestRelease;
          // continue
        })
      ])
      .then(function() {
        // Compare, to check if newer
        if ($scope.formData.latestRelease && $scope.formData.software == 'duniter') {
          var compare = csHttp.version.compare($scope.formData.version, $scope.formData.latestRelease.version);
          $scope.formData.isPreRelease = compare > 0;
          $scope.formData.hasNewRelease = compare < 0;
        }
        else {
          $scope.formData.isPreRelease = false;
          $scope.formData.hasNewRelease = false;
        }
        $scope.loading = false;
        $scope.$broadcast('$$rebind::' + 'rebind'); // force data binding
      });
  };

  // Update UI on new block
  csCurrency.api.data.on.newBlock($scope, function(block) {
    if ($scope.loading) return;
    console.debug("[peer info] Received new block. Reload content");
    $scope.load();
  });

  // Update UI on settings changed
  csSettings.api.data.on.changed($scope, function(data) {
    if ($scope.loading) return;
    console.debug("[peer info] Peer settings changed. Reload content");
    $scope.load();
  });

  // Load data when enter
  $scope.load();
}

function PeerViewController($scope, $q, $window, $state, UIUtils, csWot, BMA) {
  'ngInject';

  $scope.node = {};
  $scope.loading = true;
  $scope.isHttps = ($window.location.protocol === 'https:');
  $scope.isReachable = true;

  $scope.$on('$ionicView.beforeEnter', function (event, viewData) {
    // Enable back button (workaround need for navigation outside tabs - https://stackoverflow.com/a/35064602)
    viewData.enableBack = UIUtils.screen.isSmall() ? true : viewData.enableBack;
  });

  $scope.$on('$ionicView.enter', function(e, state) {
    var isDefaultNode = !state.stateParams || !state.stateParams.server;
    var server = state.stateParams && state.stateParams.server || BMA.server;
    var useSsl = state.stateParams && state.stateParams.ssl == "true" || (isDefaultNode ? BMA.useSsl : false);
    var useTor = state.stateParams.tor == "true" || (isDefaultNode ? BMA.useTor : false);

    return $scope.load(server, useSsl, useTor)
      .then(function() {
        return $scope.$broadcast('$csExtension.enter', e, state);
      })
      .then(function(){
        $scope.loading = false;
      });
  });

  $scope.load = function(server, useSsl, useTor) {
    var node = {
      server: server,
      host: server,
      useSsl: useSsl,
      useTor: useTor
    };
    var serverParts = server.split(':');
    if (serverParts.length == 2) {
      node.host = serverParts[0];
      node.port = serverParts[1];
    }

    angular.merge($scope.node,
      useTor ?
        // For TOR, use a web2tor to access the endpoint
        BMA.lightInstance(node.host + ".to", 443, true/*ssl*/, 60000 /*long timeout*/) :
        BMA.lightInstance(node.host, node.port, node.useSsl),
      node);

    $scope.isReachable = !$scope.isHttps || useSsl;
    if (!$scope.isReachable) {
      // Get node from the default BMA node
      return BMA.network.peers()
        .then(function(res) {
          // find the current peer
          var peers = (res && res.peers || []).reduce(function(res, json) {
            var peer = new Peer(json);
            return (peer.getEndpoints('BASIC_MERKLED_API') || []).reduce(function(res, ep) {
              var bma = BMA.node.parseEndPoint(ep);
              if((bma.dns == node.host || bma.ipv4 == node.host || bma.ipv6 == node.host) && (
                bma.port == node.port)) {
                peer.bma = bma;
                return res.concat(peer);
              }
              return res;
            }, res);
          }, []);
          var peer = peers.length && peers[0];

          // Current node found
          if (peer) {
            $scope.node.pubkey = peer.pubkey;
            $scope.node.currency = peer.currency;
            return csWot.extend($scope.node);
          }
          else {
            console.warn('Could not get peer from /network/peers');
          }
        });
    }

    return $q.all([

      // Get node peer info
      $scope.node.network.peering.self()
        .then(function(json) {
          $scope.node.pubkey = json.pubkey;
          $scope.node.currency = json.currency;
        }),

      // Get known peers
      $scope.node.network.peers()
        .then(function(json) {
          var peers = json.peers.map(function (p) {
            var peer = new Peer(p);
            peer.online = p.status == 'UP';
            peer.blockNumber = peer.block.replace(/-.+$/, '');
            peer.dns = peer.getDns();
            peer.id = peer.keyID();
            peer.server = peer.getServer();
            return peer;
          });

          // Extend (add uid+name+avatar)
          return csWot.extendAll([$scope.node].concat(peers))
            .then(function() {
              // Final sort
              $scope.peers = _.sortBy(peers, function(p) {
                var score = 1;
                score += 10000 * (p.online ? 1 : 0);
                score += 1000  * (p.hasMainConsensusBlock ? 1 : 0);
                score += 100   * (p.uid ? 1 : 0);
                return -score;
              });
              $scope.motion.show({selector: '.item-peer'});
            });
        }),

        // Get current block
        $scope.node.blockchain.current()
          .then(function(json) {
            $scope.current = json;
          })
      ])
      .catch(UIUtils.onError(useTor ? "PEER.VIEW.ERROR.LOADING_TOR_NODE_ERROR" : "PEER.VIEW.ERROR.LOADING_NODE_ERROR"));
  };

  $scope.selectPeer = function(peer) {
    // Skipp offline or WS2P node
    if (!peer.online || peer.isWs2p()) return;

    var stateParams = {server: peer.getServer()};
    if (peer.isSsl()) {
      stateParams.ssl = true;
    }
    if (peer.isTor()) {
      stateParams.tor = true;
    }
    $state.go('app.view_peer', stateParams);
  };

  /* -- manage link to raw document -- */

  $scope.openRawPeering = function(event) {
    return $scope.openLink(event, $scope.node.url + '/network/peering');
  };

  $scope.openRawCurrentBlock = function(event) {
    return $scope.openLink(event, $scope.node.url + '/blockchain/current');
  };
}
