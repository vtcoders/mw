# This is a GNU make file that uses GNU make make extensions

# Where to install files from this directory
INSTALL_DIR = $(PREFIX)/public/mw/docs

# Install these generated directories in addition to index.html
INSTALLED := fonts scripts styles

# Remove these generated files in "make clean"
CLEANDIRS := $(INSTALLED)

clean: preclean


preclean:
	rm -f *.html


include ../../../quickbuild.make
