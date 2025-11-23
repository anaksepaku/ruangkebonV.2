/api/status/all - Status semua sensor

/api/device/info - Info device detail

/api/health - Health check dengan sensor status


app.post("/api/data/:sensorType", ...)

app.get("/api/latest/:sensorType", ...)

app.get("/api/all/:sensorType", ...)
