const express = require("express");
const https = require("https");
const http = require("http");
const fs = require("fs");

const PORT = 3000;
const HTTPS_PORT = 3001;

var options = {
    key: fs.readFileSync("certs/server.key"),
    cert: fs.readFileSync("certs/server.crt"),
}

const app = express();
const server = http.createServer(app);
const https_server = https.createServer(options, app)

app.use(express.static("public"));

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/public/index.html");
});

server.listen(PORT, () => {
    console.log(`listening on ${PORT}`);
});

https_server.listen(HTTPS_PORT, () => {
    console.log(`listening on ${HTTPS_PORT}`);
});