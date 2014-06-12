apt-get -y install openjdk-7-jdk

mkdir /opt/elasticsearch #app
mkdir /opt/logstash #app
mkdir /opt/kibana #app

mkdir /etc/logstash #config
mkdir /var/log/logstash #log of logstash


cd /opt/elasticsearch
wget https://download.elasticsearch.org/elasticsearch/elasticsearch/elasticsearch-1.2.1.deb
dpkg -i elasticsearch-1.2.1.deb

cd /opt/logstash
curl -O https://download.elasticsearch.org/logstash/logstash/logstash-1.4.1.tar.gz
tar -xzf logstash-1.4.1.tar.gz


cp /home/ubuntu/install/src/log/logstash/server.conf /etc/logstash
cp /home/ubuntu/install/src/log/logstash/grok/*.grok /opt/logstash/logstash-1.4.1/patterns
cp /home/ubuntu/install/deploy/config/elasticsearch/elasticsearch.yml /etc/elasticsearch

apt-get -y install nginx

cd /opt/kibana
curl -O https://download.elasticsearch.org/kibana/kibana/kibana-3.1.0.tar.gz
tar -xzf kibana-3.1.0.tar.gz

cp /home/ubuntu/install/src/log/kibana/LogDashb.json /opt/kibana/kibana-3.1.0/app/dashboards/
cp /home/ubuntu/install/deploy/config/kibana/config.js /opt/kibana/kibana-3.1.0/

cp /home/ubuntu/install/deploy/config/nginx/default /etc/nginx/sites-available

service nginx restart

/etc/init.d/elasticsearch start
/opt/logstash/logstash-1.4.1/bin/logstash agent -v -f /etc/logstash/server.conf

