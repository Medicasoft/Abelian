/*! Copyright 2014 MedicaSoft LLC USA and Info World SRL
Licensed under the Apache License, Version 2.0 the "License";
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

//port - used to listen on localhost:<port>
var port = 8085;
//baseUrl - public Abelian API URL to be included in Location: header and in bundles (port may be missing or different by localhost service port)
var baseUrl = "http://localhost:8085/";
if(!/\/$/.test(baseUrl)) //ensure it ends with '/' 
    baseUrl += '/';
    
module.exports = {
    connString: "/tmp maildb",
    port: port,
    baseUrl: baseUrl,

    //paging for resource search 
    pageSize: 10,
    //maximum time allowed for message processing (in seconds); after this, processing is considered to have failed and the message is available again
    maxMessageProcessingTime: 60
};
