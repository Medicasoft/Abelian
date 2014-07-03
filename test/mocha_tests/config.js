var anchorPath = './abelian-test-resources/';

module.exports = {
    //servers
    aServerHost : "75.101.217.208",
    aServerServiceUrl: "abelian.medicasoft.us",
    aServerServicePort : 8085,
    aServerDomain : "abelian.medicasoft.us", //local domain name for server A
    aUser1 : "maria@abelian.medicasoft.us",
    aUserInvalid : "invalidUser@abelian.medicasoft.us",

    bServerHost : "54.198.224.233",
    bServerServiceUrl: "pb2.medicasoft.us",
    bServerServicePort : 8085,
    bServerDomain: "pb2.medicasoft.us", //local domain name for server A
    bUser1 : "catalin@pb2.medicasoft.us",

    //end to end testing
    aAnchorPath : anchorPath + 'abelian_root.pem',
    bAnchorPath: anchorPath + 'pb2_root.pem',
    //unit tests
    unitTestAnchorPath: anchorPath + 'pb2_root.pem',
    unitTestBaseUrl: "http://abelian.medicasoft.us:8085/",

    //common
    enable_log : false,
    //test case parameters (delay measured in miliseconds)
    RETRY_EMAIL_DELAY : 2000,
    INITIAL_RECEIVE_EMAIL_DELAY : 5000,
    MAX_RECEIVE_EMAIL_TRIES : 5
}