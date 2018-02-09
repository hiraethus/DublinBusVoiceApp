'use strict';

process.env.DEBUG = 'actions-on-google:*'
const App = require('actions-on-google').DialogflowApp;
const functions = require('firebase-functions');
const http = require('http');
const geom = require('spherical-geometry-js');


const NAME_ACTION = 'get_bus_stop_info';
const LOCATION_REQUESTED_ACTION = 'find_closest_bus_stop';
const NEAREST_BUS_ACTION = 'find_closest_bus_stop_shared_location';

const STOP_ID = 'stop-number';

const ALL_BUSES_URL = 'http://data.dublinked.ie/cgi-bin/rtpi/busstopinformation';
const BUS_STOP_URL = 'http://data.dublinked.ie/cgi-bin/rtpi/busstopinformation?stopid=';
const REAL_TIME_STOP_URL = 'http://data.dublinked.ie/cgi-bin/rtpi/realtimebusinformation?stopid=';


exports.dublinBusApp = functions.https.onRequest((request, response) => {
    const app = new App({request, response});
    console.log ('Request headers: ' + JSON.stringify(request.headers)); 
    console.log('Request body: ' + JSON.stringify(request.body));

    const findNearestBusStop = () => {
		if (!app.isPermissionGranted()) {
			app.askForPermissions('To find your closest bus stop', [app.SupportedPermissions.DEVICE_PRECISE_LOCATION]);
		}
    };

	const sayNearestBusStop = () => {
		if (!app.isPermissionGranted()) {
			app.tell('I need your permission for this. Please try again.');
		}

		let addDistanceFromMe = _makeAddDistanceFromMe();
		
		retrieveBusesInfo(ALL_BUSES_URL).then((busStops) => {
			busStops.forEach(addDistanceFromMe);
			busStops.sort(_byShortestDistance);
			
			let closestBusStop = busStops[0];
			let response = `Your closest bus stop is number ${closestBusStop.stopid}.`;
			
			retrieveBusesInfo(`${REAL_TIME_STOP_URL}${closestBusStop.stopid}`)
				.then((realTimeInfo) => {
					response += buildBusResponse(closestBusStop, realTimeInfo);
					app.tell(response);
				});
		});
	};
	
	const _makeAddDistanceFromMe = () => {
		let deviceCoordinates = app.getDeviceLocation().coordinates;
		let deviceLatLng = new geom.LatLng(deviceCoordinates.latitude, deviceCoordinates.longitude);

		return (busStop) => {
			let busStopLatLng = new geom.LatLng(busStop.latitude,busStop.longitude)
			busStop.distance = geom.computeDistanceBetween(deviceLatLng, busStopLatLng);
		};
	};
	
	const _byShortestDistance = (res1, res2) => res1.distance - res2.distance;
	
	const getBusStopInfo = (id) => {
        let busId = app.getArgument(STOP_ID);
		
		Promise.all([retrieveBusesInfo(`${BUS_STOP_URL}${busId}`), retrieveBusesInfo(`${REAL_TIME_STOP_URL}${busId}`)])
			.then(([busStops, realTimeInfo]) => {
				app.tell(buildBusResponse(busStops[0], realTimeInfo));
			});
    };

	const retrieveBusesInfo = (url) => {
		return new Promise((resolve, reject) => {
			http.get(url, (res) => {
				res.setEncoding('utf8');
				let rawData = '';
				res.on('data', (chunk) => { rawData += chunk; });
				res.on('end', () => {
					try {
						let result = JSON.parse(rawData);
						resolve(result.results);
					} catch (e) { 
						reject(e);
					}
				});
			});
		});
    };

	const buildBusResponse = (busStop, realTimeInfo) => {
		let response = '';

		response += 'The bus stop\'s name is ' + busStop.fullname + '. ';
		let operators = busStop.operators;
		response += 'The following routes operate from this bus stop. ';
		let routes = operators.map((op) => op.routes);
		let flatRoutes = [].concat.apply([], routes);
		response += flatRoutes.join(', ');
		response += '. ';

		let hasRealTimeInfo = realTimeInfo.length > 0;
		if (hasRealTimeInfo) {
			response += buildNextRealTimeBus(realTimeInfo);
		} else {
			response += 'There is no real time information for this bus stop. ';
		}
		
		return response;
	};
	
	const buildNextRealTimeBus = (realTimeInfo) => {
		let r = '';
		let nextBus = realTimeInfo[0];

		r += `The next bus is the number ${nextBus.route}
			to ${nextBus.destination}. `

		if (nextBus.duetime === 'Due') {
			r += 'This bus is due now. ';
		} else {
			r += `The bus is due to arrive in ${nextBus.duetime} minutes. `;
		}

		return r;
	}

	

    let actionMap = new Map();
    actionMap.set(NAME_ACTION, getBusStopInfo);
	actionMap.set(LOCATION_REQUESTED_ACTION, findNearestBusStop);
	actionMap.set(NEAREST_BUS_ACTION, sayNearestBusStop);

    app.handleRequest(actionMap);
});
