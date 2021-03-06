var http = require('http');
var finalhandler = require('finalhandler');
var serveStatic = require('serve-static');

var Serve = {
	start: function (options, done) {
		console.log(options.logger);
		options.logger = null;
		var serve = serveStatic(options.build_directory);

		var storj = require('./../app.js')();
		console.log('storj has run');
		console.log(storj);

		var server = http.createServer(function (req, res) {
			var done = finalhandler(req, res);
			serve(req, res, done);
		});

		var port = options.port || options.p || 8080;

		server.listen(port);
		console.log("Serving application on port " + port + "...");
		done();
	}
};

module.exports = Serve;
