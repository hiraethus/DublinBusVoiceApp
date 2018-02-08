'use strict';

process.env.DEBUG = 'actions-on-google:*'
const App = require('actions-on-google').DialogflowApp;
const functions = require('firebase-functions');
const http = require('http');

// a. the action name from the get_bus_stop_info action
const NAME_ACTION = 'get_bus_stop_info';
const LOCATION_ACTION = 'find_closest_bus_stop';
// b. the parameters that are parsed from the get_bus_stop_info action
const STOP_ID = 'stop-number';



exports.dublinBusApp = functions.https.onRequest((request, response) => {
    const app = new App({request, response});
    console.log ('Request headers: ' + JSON.stringify(request.headers)); 
    console.log('Request body: ' + JSON.stringify(request.body));

    function findNearestBusStop() {
		if (!app.isPermissionGranted()) {
			app.askForPermissions('To find your closest bus stop', [app.SupportedPermissions.DEVICE_PRECISE_LOCATION]);
		}
    }

    function getBusStopInfo (id) {
        let busId = app.getArgument(STOP_ID);
        retrieveBusStop(busId);
    }

    function retrieveBusStop(id) {
        http.get("http://data.dublinked.ie/cgi-bin/rtpi/busstopinformation?stopid="+id, (res) => {
            res.setEncoding('utf8');
            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                try {
		    let response = "";
                    let result = JSON.parse(rawData);
                    if (result.numberofresults == 0) {
                        response += "Bus stop number " + id + " does not exist.";
                    } else {
                        response += "The bus stop's name is " + result.results[0].fullname + ". ";
                        let operators = result.results[0].operators;
                        let routes = operators.map((op) => op.routes);
                        let flatRoutes = [].concat.apply([], routes);
                        response += "The following routes operate from this bus stop: ";
                        response += flatRoutes.join(', ');
                   }

                    response += ". Can I show you on the map?"

                   app.ask(response);
                } catch (e) { console.error(e.message); }
            });
        });
    }

// d. build an action map, which maps intent names to functions
    let actionMap = new Map();
    actionMap.set(NAME_ACTION, getBusStopInfo);
	actionMap.set(LOCATION_ACTION, findNearestBusStop);

    app.handleRequest(actionMap);
});
