function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function esiRequest(url, body) {
    let delays = [10000, 3000, 500, 0], latestError;
    while (delays.length) {
        await sleep(delays.pop());
        try {
            let response = await fetch("https://esi.evetech.net" + url, body ? {
                method: "POST",
                body: JSON.stringify(body)
            } : undefined);
            if (response.ok || response.status === 404) {
                return await response.json();
            }
            else {
                latestError = new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
            }
        }
        catch (e) {
            latestError = e;
        }
    }
    throw latestError;
}

class names {
    constructor() {
        this.$nameList = new Map();
    }

    set(id, name) {
        this.$nameList.set(id, name);
        this[id] = name || "#" + id;
    }

    getNames() {
        // Find IDs with unknown names
        let unknown = Array.from(this.$nameList).filter(e => !e[1]).map(e => e[0]);
        console.log(`Need to get ${unknown.length} names`);
        // Split IDs into batches of 1000 items
        let batches = [];
        while (unknown.length) {
            batches.push(unknown.splice(0, 1000));
        }
        // Request names from ESI
        return Promise.all(batches.map(batch => esiRequest("/v2/universe/names/", batch).then(names => names.forEach(e => this.set(e.id, e.name)))));
    }
}

const app = angular.module("lp", ["ngMaterial"]);

app.config(function ($mdThemingProvider) {
    $mdThemingProvider.theme("default").primaryPalette("deep-purple").accentPalette("deep-orange");
});

app.controller("store", function ($scope) {
    $scope.names = new names();

    // Powers the
    $scope.lpStoresTotal = 0;
    $scope.lpStoresLoaded = 0;
    $scope.loadingFinished = false;
    $scope.loadingError = false;

    $scope.corpIDs = [];
    $scope.corps = [];
    $scope.selectedCorp = false;

    $scope.lpStores = {};
    $scope.sortingMethodActive = "name";
    $scope.sortingMethods = {
        "name": {text: "Item name", sort: offer => $scope.names[offer.type_id]},
        "quantity": {text: "Quantity", sort: ["-quantity", offer => $scope.names[offer.type_id]]},
        "isk": {text: "ISK cost", sort: ["isk_cost", offer => $scope.names[offer.type_id]]},
        "point": {text: "Point cost", sort: ["lp_cost", "ak_cost", offer => $scope.names[offer.type_id]]}
    };

    async function start() {
        // Load list of NPC corporations
        $scope.corpIDs = await esiRequest("/v1/corporations/npccorps/");
        $scope.lpStoresTotal = $scope.corpIDs.length;

        await Promise.all($scope.corpIDs.map(corpID => Promise.all([
            // Load corp details
            esiRequest(`/v4/corporations/${corpID}/`).then(corp => {
                $scope.names.set(corpID, corp.name);
                $scope.names.set(corp.home_station_id);
                $scope.corps.push({
                    id: corpID,
                    name: corp.name,
                    ticker: corp.ticker,
                    description: corp.description,
                    hq: corp.home_station_id
                });
            }),
            // Load corp loyalty store offers
            esiRequest(`/v1/loyalty/stores/${corpID}/offers/`).then(offers => {
                // ESI still returns 404 errors for some NPC corps
                if (!Array.isArray(offers)) {
                    offers = [];
                }
                offers.forEach(offer => {
                    $scope.names.set(offer.type_id);
                    offer.required_items.forEach(item => {
                        $scope.names.set(item.type_id);
                    });
                });
                $scope.lpStores[corpID] = offers;
            })
        ])));
        $scope.loadingFinished = true;
        await $scope.names.getNames();
        $scope.$apply();
    }

    start().then(() => console.log("Loaded LP store data"), error => {
        $scope.loadingError = error.message;
        $scope.$apply();
    });
});