#!/usr/bin/env python

import paho.mqtt.client as mqtt

topics = [];
global n;
n = 1;

def on_connect(client, userdata, rc):
    print("Connected with result code "+str(rc))
    #client.subscribe("spm/+")
    client.subscribe("spm/+")

def on_message(client, userdata, msg):
    # print "Topic: ", msg.topic+'\nMessage: '+msg.payload
    
    if (n > 500):
        print("Stop")
        client.loop_stop()
    if not (msg.topic in topics):
        topic = msg.topic[4:]
        topics.append(msg.topic)
        print "Topic:", topic
        with open("wams.txt", "a") as myfile:
            myfile.write(topic + "\n")

client = mqtt.Client()
client.on_connect = on_connect
client.on_message = on_message
client.connect("10.122.248.42", 1883)

client.loop_forever()

