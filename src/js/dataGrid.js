(function () {
    'use strict';

    angular
        .module('dataGrid', [])
        .filter('startFrom', function () {
            return function (input, start) {
                if (input) {
                    start = +start;
                    return input.slice(start);
                }
                return [];
            }
        })
        .controller('gridController', ['$scope', '$element', '$filter', '$location', 'filtersFactory', '$timeout', function ($scope, $element, $filter, $location, filtersFactory, $timeout) {
            // values by default
            $scope._gridActions = $scope.gridActions || {};

            $scope.paginationOptions = {};
            $scope.defaultsPaginationOptions = {
                itemsPerPage: $scope.paginationOptions.itemsPerPage || '10',
                currentPage: $scope.paginationOptions.currentPage || 1
            };
            $scope.paginationOptions = angular.copy($scope.defaultsPaginationOptions);
            $scope.sortOptions = {};
            $scope.customFilters = {};

            $timeout(parseUrl);

            var sortingChange, reload;

            $scope.$watch('gridRecords', function (newValue) {
                if (newValue && newValue.length) {
                    $scope.sortCache = {};
                    $scope.filters.forEach(function (filter) {
                        if (filter.filterType === 'select') {
                            $scope[filter.model + 'Options'] = generateOptions($scope.gridRecords, filter.filterBy);
                        }
                    });

                    if ($scope.urlSync) {
                        parseUrl();
                    }
                }
            });

            $scope.sort = $scope.$parent.sort = function (predicate, isDefaultSort) {
                if (!isDefaultSort) {
                    var direction = $scope.sortOptions.predicate === predicate && $scope.sortOptions.direction === 'desc' ? 'asc' : 'desc';
                    $scope.sortOptions.direction = direction;
                    $scope.sortOptions.predicate = predicate;
                }
                $scope.paginationOptions.currentPage = 1;
                $scope.reloadGrid(isDefaultSort);
                sortingChange = true;
            };

            $scope.filter = $scope.$parent.filter = function () {
                $scope.paginationOptions.currentPage = 1;
                $scope.reloadGrid();
            };

            $scope.$on('$locationChangeSuccess', function () {
                if (shouldUpdate()) {
                    if ($scope.serverPagination) {
                        clearTimeout($scope.getDataTimeout);
                        $scope.getDataTimeout = setTimeout(getData, $scope.getDataDelay);
                    }
                    if ($scope.gridRecords) {
                        parseUrl();
                    }
                }
            });

            function shouldUpdate() {
                var update = $scope.urlSync || $scope.serverPagination;
                var _reload = reload;
                var _sortingChange = sortingChange;
                sortingChange = false;
                reload = false;
                return update && (_reload || _sortingChange);
            }

            $scope.reloadGrid = function (isDefaultSort) {
                reload = true;
                if ($scope.urlSync || $scope.serverPagination) {
                    changePath(isDefaultSort);
                } else {
                    applyFilters();
                }
            };

            $scope._gridActions.refresh = $scope.reloadGrid;
            $scope.$parent.reloadGrid = $scope.reloadGrid;
            $scope._gridActions.filter = $scope.filter;
            $scope._gridActions.sort = $scope.sort;
            function changePath(isDefaultSort) {
                var path = {}, needApplyFilters = false;

                path.page = $scope.paginationOptions.currentPage;
                if ($scope.paginationOptions.itemsPerPage !== $scope.defaultsPaginationOptions.itemsPerPage) {
                    path.itemsPerPage = $scope.paginationOptions.itemsPerPage;
                }

                if ($scope.sortOptions.predicate) {
                    path.sort = encodeURIComponent($scope.sortOptions.predicate + "-" + $scope.sortOptions.direction);
                }

                //custom filters
                $scope.filters.forEach(function (filter) {
                    var urlName = filter.model,
                        value = filter.isInScope ? $scope.$eval(urlName) : $scope.$parent.$eval(urlName);

                    if (filter.disableUrl) {
                        needApplyFilters = true;
                        return;
                    }

                    if (value) {
                        var strValue;
                        if (value instanceof Date) {
                            if (isNaN(value.getTime())) {
                                return;
                            }
                            strValue = value.getFullYear() + '-';
                            strValue += value.getMonth() < 9 ? '0' + (value.getMonth() + 1) + '-' : (value.getMonth() + 1) + '-';
                            strValue += value.getDate() < 10 ? '0' + value.getDate() : value.getDate();
                            value = strValue;
                        }
                        path[encodeURIComponent(urlName)] = encodeURIComponent(value);
                    }
                });

                if (needApplyFilters) {
                    applyFilters();
                }
                $location.search(path);
                if (isDefaultSort) {
                    $scope.$apply();
                }
            }

            function parseUrl() {
                var url = $.param($location.search()),
                    params = {},
                    customParams = {};

                $scope.params = params;

                url.split('&').forEach(function (urlParam) {
                        var param = urlParam.split('=');
                        params[param[0]] = param[1];
                        if (param[0] !== 'page' && param[0] !== 'sort' && param[0] !== 'itemsPerPage') {
                            customParams[decodeURIComponent(param[0])] = decodeURIComponent(param[1]);
                        }
                    }
                );

                //custom filters
                $scope.filters.forEach(function (filter) {
                    var urlName = filter.model,
                        value = customParams[urlName];

                    if (filter.disableUrl) {
                        return;
                    }

                    //datepicker-specific
                    if (~filter.filterType.toLowerCase().indexOf('date')) {
                        $scope.$parent.__evaltmp = value ? new Date(value) : null;
                        $scope.$parent.$eval(urlName + '=__evaltmp');
                        return;
                    }


                    if (filter.filterType === 'select' && !value) {
                        value = '';
                    }

                    if (value) {
                        if (filter.isInScope) {
                            $scope.__evaltmp = value;
                            $scope.$eval(urlName + '=__evaltmp');
                        } else {
                            $scope.$parent.__evaltmp = value;
                            $scope.$parent.$eval(urlName + '=__evaltmp');
                        }
                    }
                });

                //pagination options
                $scope.paginationOptions.itemsPerPage = $scope.defaultsPaginationOptions.itemsPerPage;
                $scope.paginationOptions.currentPage = $scope.defaultsPaginationOptions.currentPage;

                if (params.itemsPerPage) {
                    $scope.paginationOptions.itemsPerPage = params.itemsPerPage;
                }

                if (params.page) {
                    if (!$scope.serverPagination && ((params.page - 1) * $scope.paginationOptions.itemsPerPage > $scope.gridRecords.length)) {
                        $scope.paginationOptions.currentPage = 1;
                    } else {
                        $scope.paginationOptions.currentPage = params.page;
                    }
                }

                //sort options
                if (params.sort) {
                    var sort = params.sort.split('-');
                    $scope.sortOptions.predicate = decodeURIComponent(sort[0]);
                    $scope.sortOptions.direction = decodeURIComponent(sort[1]);
                }
                if (!$scope.serverPagination) {
                    applyFilters();
                }
            }

            function getData() {
                var search = $location.search();
                var isEmpty = !Object.keys(search).length;
                if (isEmpty && $scope.sortOptions.predicate) {
                    $scope.sort($scope.sortOptions.predicate, true);
                } else {
                    $scope.$parent.params = search;
                    $scope.getRecords(search).then(function (result) {
                        $scope.gridRecords = result.records;
                        $scope.paginationOptions.totalItems = result.totalCount;
                    });
                }
                // -> to promise
                //$scope._gridOptions.getData('?' + url).then(function (data, totalItems) {
                //    $scope.gridRecords = data;
                //    $scope.paginationOptions.totalItems = totalItems;
                //});
            }

            function applyFilters() {
                var time = Date.now(), sorted = false;

                //TO REMOVE ?
                $scope._time = {};

                if ($scope.sortOptions.predicate && $scope.sortCache && $scope.sortCache.predicate === $scope.sortOptions.predicate
                    && $scope.sortCache.direction === $scope.sortOptions.direction) {
                    $scope.gridRecords = $scope.sortCache.data.slice();
                    sorted = true;
                }

                $scope._time.copy = Date.now() - time;
                var time2 = Date.now();
                applyCustomFilters();
                $scope._time.filters = Date.now() - time2;
                var time3 = Date.now();

                if ($scope.sortOptions.predicate && !sorted) {
                    $scope.gridRecords = $filter('orderBy')($scope.gridRecords, $scope.sortOptions.predicate, $scope.sortOptions.direction === 'desc');
                    $scope.sortCache = {
                        data: $scope.gridRecords.slice(),
                        predicate: $scope.sortOptions.predicate,
                        direction: $scope.sortOptions.direction
                    }
                }
                $scope._time.sort = Date.now() - time3;
                $scope._time.all = Date.now() - time;
                $scope.paginationOptions.totalItems = $scope.gridRecords.length;
            }

            function applyCustomFilters() {
                $scope.filters.forEach(function (filter) {
                    var predicate = filter.filterBy,
                        urlName = filter.model,
                        value = filter.isInScope ? $scope.$eval(urlName) : $scope.$parent.$eval(urlName),
                        type = filter.filterType;
                    if ($scope.customFilters[urlName]) {
                        $scope.gridRecords = $scope.customFilters[urlName]($scope.gridRecords, value, predicate);
                    } else if (value && type) {
                        var filterFunc = filtersFactory.getFilterByType(type);
                        if (filterFunc) {
                            $scope.gridRecords = filterFunc($scope.gridRecords, value, predicate);
                        }
                    }
                });
            }
        }])
        .directive('gridData', ['$compile', '$animate', function ($compile) {
            return {
                restrict: 'EA',
                //transclude: true,
                //replace: true,
                scope: {
                    serverPagination : '=?',
                    gridData : '=?',
                    gridRecords : '=?',
                    getRecords : '&',
                    gridActions : '=?',
                    getDataDelay : '=?',
                    sortOptions : '=?',
                    paginationOptions : '=?',
                    count : '=?'
                },
                controller: 'gridController',
                link: function ($scope, $element, attrs) {
                    var sorting = [],
                        filters = [],
                        rows = [],
                        directiveElement = $element.parent(),
                        gridId = attrs.id,
                        serverPagination = attrs.serverPagination === 'true';
                    $scope.getDataDelay = $scope.getDataDelay || 350;

                    angular.forEach(angular.element(directiveElement[0].querySelectorAll('[sortable]')), function (sortable) {
                        var element = angular.element(sortable),
                            predicate = element.attr('sortable');
                        sorting.push(element);
                        element.attr('ng-class', "{'sort-ascent' : sortOptions.predicate ==='" +
                            predicate + "' && sortOptions.direction === 'asc', 'sort-descent' : sortOptions.predicate === '" +
                            predicate + "' && sortOptions.direction === 'desc'}");
                        element.attr('ng-click', "sort('" + predicate + "')");
                        $compile(element)($scope);
                    });

                    angular.forEach(angular.element(document.querySelectorAll('[filter-by]')), function (filter) {
                        var element = angular.element(filter),
                            isInScope = $element.find(element).length > 0,
                            predicate = element.attr('filter-by'),
                            filterType = element.attr('filter-type') || '',
                            urlName = element.attr('ng-model'),
                            disableUrl = element.attr('disable-url');

                        if (gridId && element.attr('grid-id') && gridId != element.attr('grid-id')) {
                            return;
                        }

                        if (filterType !== 'select') {
                        } else {
                            $scope[urlName + 'Options'] = generateOptions($scope.$eval($element.attr('grid-options') + '.data'), predicate);
                        }

                        if (~filterType.indexOf('date') && !element.attr('ng-focus')
                            && !element.attr('ng-blur')) {
                            element.attr('ng-focus', "filter('{" + urlName + " : " + "this." + urlName + "}')");
                            element.attr('ng-blur', "filter('{" + urlName + " : " + "this." + urlName + "}')");
                            //$compile(element)($scope);
                        }
                        if (!urlName) {
                            urlName = predicate;
                            element.attr('ng-model', predicate);
                            element.attr('ng-change', 'filter()');
                            //$compile(element)($scope);
                        }
                        //$compile(element)($scope);
                        filters.push({
                            model: urlName,
                            isInScope: isInScope,
                            filterBy: predicate,
                            filterType: filterType,
                            disableUrl: disableUrl
                        });
                    });

                    angular.forEach(angular.element(directiveElement[0].querySelectorAll('[grid-item]')), function (row) {
                        var element = angular.element(row);
                        rows.push(element);
                        if (serverPagination) {
                            element.attr('ng-repeat', "item in filtered");
                        } else {
                            element.attr('ng-repeat', "item in filtered | startFrom:(paginationOptions.currentPage-1)*paginationOptions.itemsPerPage | limitTo:paginationOptions.itemsPerPage track by $index");
                        }
                        $compile(element)($scope);
                    });

                    $scope.sorting = sorting;
                    $scope.rows = rows;
                    $scope.filters = filters;
                }
            }
        }])
        .factory('filtersFactory', function () {
            function selectFilter(items, value, predicate) {
                return items.filter(function (item) {
                    return value && item[predicate] ? item[predicate] === value : true;
                });
            }

            function textFilter(items, value, predicate) {
                return items.filter(function (item) {
                    return value && item[predicate] ? ~(item[predicate] + '').toLowerCase().indexOf((value + '').toLowerCase()) : !!item[predicate];
                });
            }

            function dateToFilter(items, value, predicate) {
                value = new Date(value).getTime();
                return items.filter(function (item) {
                    return value && item[predicate] ? item[predicate] <= value + 86399999 : true;
                });
            }

            function dateFromFilter(items, value, predicate) {
                value = new Date(value).getTime();
                return items.filter(function (item) {
                    return value && item[predicate] ? item[predicate] >= value : true;
                });
            }

            return {
                getFilterByType: function (type) {
                    switch (type) {
                        case 'select' :
                        {
                            return selectFilter;
                        }
                        case 'text' :
                        {
                            return textFilter;
                        }
                        case 'dateTo':
                        {
                            return dateToFilter;
                        }
                        case 'dateFrom':
                        {
                            return dateFromFilter;
                        }
                        default :
                        {
                            return null;
                        }
                    }
                }
            }
        });

    function generateOptions(values, predicate) {
        var array = [];
        if (values) {
            values.forEach(function (item) {
                if (!~array.indexOf(item[predicate])) {
                    array.push(item[predicate]);
                }
            });

            return array.map(function (option) {
                return {text: option, value: option};
            });
        }
    }
})();