#!/usr/bin/env python

import paho.mqtt.client as mqtt

def on_connect(client, userdata, rc):
    print("Connected with result code "+str(rc))
    #client.subscribe("spm/+")
    client.subscribe("spm/167002045410006104bfa000a0000094")

def on_message(client, userdata, msg):
    print "Topic: ", msg.topic+'\nMessage: '+msg.payload

client = mqtt.Client()
client.on_connect = on_connect
client.on_message = on_message
client.connect("10.122.248.42", 1883)

client.loop_forever()

