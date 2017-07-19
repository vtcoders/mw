#!/bin/bash

set -e

function mk_teapot()
{

    sed teapot.x3d.xxx -e "s/@RGB_COLOR@/$1/g"

}
