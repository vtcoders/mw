# This is a GNU make file that uses GNU make make extensions

# We exclude the videoMotionTracking directory for now
SUBDIRS := lib etc public bin

# Build this but do not install it:
BUILD_NO_INSTALL := mw_server

mw_server:
	ln -fs lib/$@ $@

include ./quickbuild.make
