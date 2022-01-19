# High performance HISP

# OpenSSL compilation steps

sudo yum install perl gcc make zlib-devel -y

# installing Openssl into /opt directory
cd /opt
curl -L -O https://github.com/Medicasoft/openssl/releases/download/1.0.2m-a/openssl-1.0.2m_skid-akid-patch.tar.gz
tar xvf openssl-1.0.2m_skid-akid-patch.tar.gz

# compile changed version
## optional: replace "/opt/openssl-1.0.2m/install" below with the desired installation path
cd openssl-1.0.2m
sudo mkdir /opt/openssl-1.0.2m/install

./config --prefix=/opt/openssl-1.0.2m/install --openssldir=/opt/openssl-1.0.2m/install
make

sudo cp /opt/openssl-1.0.2m/apps/openssl.cnf /opt/openssl-1.0.2m/install/
sudo cp /opt/openssl-1.0.2m/apps/openssl /opt/openssl-1.0.2m/install/

# test installation
cd /opt/openssl-1.0.2m/install
# use ./ to use local openssl, not openssl from PATH (!)
./openssl version
# expected output:
# OpenSSL 1.0.2m  2 Nov 2017


