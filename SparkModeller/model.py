model = {
    "id": 1,
    "modelid": "rf",
    "name": "AR",
    "dataminerurl": "http://atena.ijs.si/api/",
    "timestamp": "Time",
    "sensors": [
        # Autoregressive (AR) and other sensor (OS) data
        {
            "name": "175339 Avtocenter ABC Kromberk 98441643-Consumed real power-pc",
            "ts": [0, -24, -48, -168],
            "aggrs": ["ma1h", "ma6h", "ma1d", "ma1w", "ma1m", "min1d", "min1w", "max1d", "max1w", "var6h", "var1d", "var1w"],
            "type": "sensor"
        },

        # Weather forecast (WF) data

        # static featres (SF)
        {
            "name": "dayOfWeek",
            "ts": [24],
            "type": "feature"
        },
        {
            "name": "holiday",
            "ts": [24],
            "aggrs": [],
            "type": "feature"
        }
    ]
}
