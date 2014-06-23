var port = 8085;

module.exports = {
    connString: "/var/run/postgresql maildb",
    port: port,
    baseUrl: "http://localhost:" + port + "/"
};