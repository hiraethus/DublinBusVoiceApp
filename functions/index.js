'use strict';

process.env.DEBUG = 'actions-on-google:*'
const App = require('actions-on-google').DialogflowApp;
const functions = require('firebase-functions');
const http = require('http');
const geom = require('spherical-geometry-js');

// a. the action name from the get_bus_stop_info action
const NAME_ACTION = 'get_bus_stop_info';
const LOCATION_REQUESTED_ACTION = 'find_closest_bus_stop';
const NEAREST_BUS_ACTION = 'find_closest_bus_stop_shared_location';
// b. the parameters that are parsed from the get_bus_stop_info action
const STOP_ID = 'stop-number';

// urls
const ALL_BUSES_URL = "http://data.dublinked.ie/cgi-bin/rtpi/busstopinformation";
const BUS_STOP_URL = "http://data.dublinked.ie/cgi-bin/rtpi/busstopinformation?stopid=";


exports.dublinBusApp = functions.https.onRequest((request, response) => {
    const app = new App({request, response});
    console.log ('Request headers: ' + JSON.stringify(request.headers)); 
    console.log('Request body: ' + JSON.stringify(request.body));

    function findNearestBusStop() {
		if (!app.isPermissionGranted()) {
			app.askForPermissions('To find your closest bus stop', [app.SupportedPermissions.DEVICE_PRECISE_LOCATION]);
		}
    }

	function sayNearestBusStop() {
		if (!app.isPermissionGranted()) {
			app.tell("I need your permission for this");
		}
		let deviceCoordinates = app.getDeviceLocation().coordinates;
		let deviceLatLng = new geom.LatLng(deviceCoordinates.latitude, deviceCoordinates.longitude);
		
		retrieveBusesInfo(ALL_BUSES_URL).then((busStops) => {
			busStops.forEach((res) => {
				let resLatLng = new geom.LatLng(res.latitude,res.longitude)
				res.distance = geom.computeDistanceBetween(deviceLatLng, resLatLng);
			});
			
			busStops.sort((res1, res2) => {
				return res1.distance - res2.distance;
			});
			
			let closestBusStop = busStops[0];
			let response = `Your closest bus stop is number ${closestBusStop.stopid}.`;
			response += buildBusResponse(closestBusStop);
			app.tell(response);
		});
	}
	
	function getBusStopInfo (id) {
        let busId = app.getArgument(STOP_ID);
		
		retrieveBusesInfo(`${BUS_STOP_URL}${busId}`)
			.then((busStops) => {
				app.tell(buildBusResponse(busStops[0]));
			});
    }

	function retrieveBusesInfo(url) {
		return new Promise((resolve, reject) => {
			http.get(url, (res) => {
				res.setEncoding('utf8');
				let rawData = '';
				res.on('data', (chunk) => { rawData += chunk; });
				res.on('end', () => {
					try {
						let result = JSON.parse(rawData);
						if (result.numberofresults > 0) {
							console.log("Got here");
							resolve(result.results);
						} else {
							reject(new Error("There were no bus stops"));
						}
					} catch (e) { 
						reject(e);
					}
				});
			});
		});
    }

	function buildBusResponse(busStop) {
		let response = '';
		response += "The bus stop's name is " + busStop.fullname + ". ";
		let operators = busStop.operators;
		let routes = operators.map((op) => op.routes);
		let flatRoutes = [].concat.apply([], routes);
		response += "The following routes operate from this bus stop. ";
		response += flatRoutes.join(', ');
		
		return response;
	}

    let actionMap = new Map();
    actionMap.set(NAME_ACTION, getBusStopInfo);
	actionMap.set(LOCATION_REQUESTED_ACTION, findNearestBusStop);
	actionMap.set(NEAREST_BUS_ACTION, sayNearestBusStop);

    app.handleRequest(actionMap);
});
