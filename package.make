# This is a GNU make file that is particular to this mirror worlds
# package.



# PREFIX is there from quickbuild

# NODEJS_SHABANG is there from quickbuild

# CSS_COMPRESS is there from quickbuild
#CSS_COMPRESS ?= yui-compressor --line-break 70 --type css

# JS_COMPRESS is there from quickbuild
#JS_COMPRESS ?= yui-compressor --line-break 70 --type js

HTTP_PORT ?= 8888

HTTPS_PORT ?= 8383

CONFIG_VARS := HTTP_PORT HTTPS_PORT

IN_VARS := HTTP_PORT HTTPS_PORT
