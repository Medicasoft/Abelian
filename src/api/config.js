var port = 8085;
var baseUrl = "http://localhost:" + port + "/";
if(!/\/$/.test(baseUrl)) //ensure it ends with '/' 
    baseUrl += '/';
    
module.exports = {
    connString: "/var/run/postgresql maildb",
    port: port,
    baseUrl: baseUrl,

    //paging for resource search 
    pageSize: 10
};
