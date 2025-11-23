const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = 3000;
const SERVER_IP = "172.16.0.111";

// Middleware
app.use(cors());
app.use(express.json({ strict: false }));
app.use(express.static(path.join(__dirname, "public")));

// PERBAIKAN: Data storage untuk semua sensor
let sensorData = {
  power: [],
  suhu: [],
  ph: [],
  tds: [],
  pompa: [],
};

let latestData = {
  power: {},
  suhu: {},
  ph: {},
  tds: {},
  pompa: { status: false, mode: "manual" },
};

let deviceStatus = {
  isOnline: false,
  lastSeen: null,
  deviceId: null,
  lastSensorUpdate: {} // PERBAIKAN: Track update per sensor
};

// Timeout dalam milisecond (30 detik)
const DEVICE_TIMEOUT = 30000;
const SENSOR_TIMEOUT = 30000; // PERBAIKAN: Timeout per sensor

// PERBAIKAN: Daftar sensor yang valid
const validSensors = ["power", "suhu", "ph", "tds", "pompa"];

// PERBAIKAN: Function to validate data per sensor type
function validateSensorData(data, type) {
  const validated = { ...data };

  switch (type) {
    case "power":
      if (isNaN(validated.voltage) || !isFinite(validated.voltage))
        validated.voltage = 0;
      if (isNaN(validated.current) || !isFinite(validated.current))
        validated.current = 0;
      if (isNaN(validated.power) || !isFinite(validated.power))
        validated.power = 0;
      if (isNaN(validated.energy) || !isFinite(validated.energy))
        validated.energy = 0;
      if (isNaN(validated.frequency) || !isFinite(validated.frequency))
        validated.frequency = 0;
      if (isNaN(validated.power_factor) || !isFinite(validated.power_factor))
        validated.power_factor = 0;
      break;

    case "suhu":
      if (isNaN(validated.suhu) || !isFinite(validated.suhu))
        validated.suhu = 0;
      if (isNaN(validated.kelembaban) || !isFinite(validated.kelembaban))
        validated.kelembaban = 0;
      if (isNaN(validated.heat_index) || !isFinite(validated.heat_index))
        validated.heat_index = 0;
      break;

    case "ph":
      if (isNaN(validated.ph) || !isFinite(validated.ph)) validated.ph = 7.0;
      break;

    case "tds":
      if (isNaN(validated.tds) || !isFinite(validated.tds)) validated.tds = 0;
      if (isNaN(validated.suhu_air) || !isFinite(validated.suhu_air))
        validated.suhu_air = 0;
      break;

    case "pompa":
      if (typeof validated.status !== "boolean") validated.status = false;
      if (!validated.mode) validated.mode = "manual";
      break;
  }

  return validated;
}

// PERBAIKAN: Check device status dengan sensor-based tracking
function checkDeviceStatus() {
  const now = Date.now();
  
  // Cek jika ada sensor yang update dalam 30 detik terakhir
  const recentUpdates = Object.values(deviceStatus.lastSensorUpdate).some(
    timestamp => timestamp && (now - timestamp < DEVICE_TIMEOUT)
  );
  
  if (!recentUpdates && deviceStatus.isOnline) {
    deviceStatus.isOnline = false;
    console.log(`⚠️  Device ${deviceStatus.deviceId} is now offline`);
  } else if (recentUpdates && !deviceStatus.isOnline) {
    deviceStatus.isOnline = true;
    console.log(`✅ Device ${deviceStatus.deviceId} is now online`);
  }
}

// Check status every 5 seconds
setInterval(checkDeviceStatus, 5000);

// PERBAIKAN: Route untuk terima data dari ESP32 per sensor type
app.post("/api/data/:sensorType", (req, res) => {
  const sensorType = req.params.sensorType;
  
  // Validasi sensor type
  if (!validSensors.includes(sensorType)) {
    return res.status(400).json({
      error: "Invalid sensor type",
      message: `Sensor type must be one of: ${validSensors.join(", ")}`,
      server_ip: SERVER_IP
    });
  }

  console.log(`📨 [${sensorType.toUpperCase()}] Data received:`, req.body);

  try {
    const validatedData = validateSensorData(req.body, sensorType);

    // PERBAIKAN: Update device status dengan sensor-specific tracking
    const now = Date.now();
    deviceStatus.isOnline = true;
    deviceStatus.lastSeen = now;
    deviceStatus.lastSensorUpdate[sensorType] = now;
    deviceStatus.deviceId = req.body.deviceId || `ESP32_${sensorType.toUpperCase()}`;

    // Tambah timestamp
    const dataWithTime = {
      ...validatedData,
      timestamp: new Date().toLocaleTimeString(),
      date: new Date().toLocaleDateString(),
      deviceId: deviceStatus.deviceId,
      sensorType: sensorType,
      unix_timestamp: now,
    };

    // Simpan data
    latestData[sensorType] = dataWithTime;
    sensorData[sensorType].push(dataWithTime);

    // Simpan hanya 100 data terakhir per sensor
    if (sensorData[sensorType].length > 100) {
      sensorData[sensorType] = sensorData[sensorType].slice(-100);
    }

    console.log(`✅ [${sensorType.toUpperCase()}] Data saved from ${deviceStatus.deviceId}`);

    res.json({
      message: `Data ${sensorType} received OK!`,
      status: "success",
      device_status: "online",
      server_ip: SERVER_IP,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`❌ [${sensorType.toUpperCase()}] Error:`, error);
    res.status(400).json({
      error: "Invalid data format",
      message: error.message,
      server_ip: SERVER_IP
    });
  }
});

// PERBAIKAN: Kontrol Pompa
app.post("/api/pompa/control", (req, res) => {
  const { action, mode } = req.body;
  console.log(`🔧 Pompa control: ${action}, mode: ${mode}`);

  const now = Date.now();
  deviceStatus.isOnline = true;
  deviceStatus.lastSeen = now;
  deviceStatus.lastSensorUpdate.pompa = now;

  latestData.pompa = {
    status: action === "on",
    mode: mode || "manual",
    last_updated: new Date().toISOString(),
    controlled_by: "web-dashboard",
    deviceId: deviceStatus.deviceId || "WEB_CONTROL",
    timestamp: new Date().toLocaleTimeString(),
    unix_timestamp: now
  };

  // Simpan ke history
  sensorData.pompa.push(latestData.pompa);
  if (sensorData.pompa.length > 100) {
    sensorData.pompa = sensorData.pompa.slice(-100);
  }

  res.json({
    status: "success",
    message: `Pompa ${action === "on" ? "dinyalakan" : "dimatikan"}`,
    data: latestData.pompa,
  });
});

// PERBAIKAN: Route untuk ambil data terbaru per sensor
app.get("/api/latest/:sensorType", (req, res) => {
  const sensorType = req.params.sensorType;
  
  if (!validSensors.includes(sensorType)) {
    return res.status(400).json({
      error: "Invalid sensor type",
      message: `Sensor type must be one of: ${validSensors.join(", ")}`
    });
  }

  const response = {
    ...latestData[sensorType],
    device_status: deviceStatus,
    server_ip: SERVER_IP,
    sensor_type: sensorType,
    last_update: deviceStatus.lastSensorUpdate[sensorType] || null
  };
  
  res.json(response);
});

// PERBAIKAN: Route untuk ambil semua data per sensor
app.get("/api/all/:sensorType", (req, res) => {
  const sensorType = req.params.sensorType;
  
  if (!validSensors.includes(sensorType)) {
    return res.status(400).json({
      error: "Invalid sensor type",
      message: `Sensor type must be one of: ${validSensors.join(", ")}`
    });
  }

  res.json({
    data: sensorData[sensorType],
    count: sensorData[sensorType].length,
    sensor_type: sensorType,
    server_ip: SERVER_IP,
    device_status: deviceStatus
  });
});

// PERBAIKAN: Route untuk ambil status device saja
app.get("/api/status", (req, res) => {
  res.json(deviceStatus);
});

// PERBAIKAN: Health check endpoint
app.get("/api/health", (req, res) => {
  const sensorStatus = {};
  let onlineSensors = 0;
  
  validSensors.forEach(sensor => {
    const isOnline = deviceStatus.lastSensorUpdate[sensor] && 
                    (Date.now() - deviceStatus.lastSensorUpdate[sensor] < SENSOR_TIMEOUT);
    sensorStatus[sensor] = isOnline ? "online" : "offline";
    if (isOnline) onlineSensors++;
  });

  res.json({
    status: "healthy",
    server_ip: SERVER_IP,
    port: PORT,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    device_status: deviceStatus,
    sensors_online: onlineSensors,
    sensors_total: validSensors.length,
    sensor_status: sensorStatus
  });
});

// PERBAIKAN: Endpoint untuk status semua sensor
app.get("/api/status/all", (req, res) => {
  const sensorStatus = {};
  const now = Date.now();
  
  validSensors.forEach(sensorType => {
    const lastUpdate = deviceStatus.lastSensorUpdate[sensorType];
    const isOnline = lastUpdate && (now - lastUpdate < SENSOR_TIMEOUT);
    
    sensorStatus[sensorType] = {
      online: isOnline,
      lastUpdate: lastUpdate,
      data: latestData[sensorType] || {},
      history_count: sensorData[sensorType].length
    };
  });

  res.json({
    server: "online",
    timestamp: new Date().toISOString(),
    device_status: deviceStatus,
    sensors: sensorStatus
  });
});

// PERBAIKAN: Endpoint untuk device info
app.get("/api/device/info", (req, res) => {
  const sensorUpdates = {};
  const now = Date.now();
  
  validSensors.forEach(sensor => {
    const lastUpdate = deviceStatus.lastSensorUpdate[sensor];
    const ageSeconds = lastUpdate ? Math.round((now - lastUpdate) / 1000) : null;
    
    sensorUpdates[sensor] = {
      last_update: lastUpdate,
      age_seconds: ageSeconds,
      status: lastUpdate && (now - lastUpdate < SENSOR_TIMEOUT) ? "online" : "offline"
    };
  });

  res.json({
    device_id: deviceStatus.deviceId,
    is_online: deviceStatus.isOnline,
    last_seen: deviceStatus.lastSeen,
    server_uptime: process.uptime(),
    sensor_updates: sensorUpdates,
    server_ip: SERVER_IP
  });
});

// PERBAIKAN: Route untuk reset data per sensor atau semua
app.delete("/api/reset/:sensorType?", (req, res) => {
  const sensorType = req.params.sensorType;
  
  if (sensorType) {
    // Reset sensor tertentu
    if (!validSensors.includes(sensorType)) {
      return res.status(400).json({
        error: "Invalid sensor type",
        message: `Sensor type must be one of: ${validSensors.join(", ")}`
      });
    }
    
    sensorData[sensorType] = [];
    latestData[sensorType] = sensorType === "pompa" ? { status: false, mode: "manual" } : {};
    deviceStatus.lastSensorUpdate[sensorType] = null;
    console.log(`🔄 Data ${sensorType} reset by client`);
    
    res.json({
      message: `Data ${sensorType} reset successfully`,
      server_ip: SERVER_IP
    });
  } else {
    // Reset semua data
    validSensors.forEach(sensor => {
      sensorData[sensor] = [];
      latestData[sensor] = sensor === "pompa" ? { status: false, mode: "manual" } : {};
      deviceStatus.lastSensorUpdate[sensor] = null;
    });
    deviceStatus.isOnline = false;
    deviceStatus.lastSeen = null;
    console.log(`🔄 All data reset by client`);
    
    res.json({
      message: "All sensor data reset successfully",
      server_ip: SERVER_IP
    });
  }
});

// Serve static files dari public folder
app.use(express.static("public"));

// Serve halaman dashboard
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    server_ip: SERVER_IP,
    available_endpoints: [
      "GET /",
      "GET /api/health",
      "GET /api/status/all", 
      "GET /api/device/info",
      "POST /api/data/:sensorType (power|suhu|ph|tds|pompa)",
      "GET /api/latest/:sensorType",
      "GET /api/all/:sensorType",
      "POST /api/pompa/control",
      "DELETE /api/reset/:sensorType?"
    ]
  });
});

// Jalankan server
app.listen(PORT, "0.0.0.0", () => {
  console.log("=".repeat(60));
  console.log(`🏠 Ruang Kebon Smart Farming Dashboard`);
  console.log(`📍 Server: http://${SERVER_IP}:${PORT}`);
  console.log(`📍 Local:  http://localhost:${PORT}`);
  console.log("=".repeat(60));
  console.log("📋 Available Endpoints:");
  console.log(`   POST /api/data/power    - Receive power data`);
  console.log(`   POST /api/data/suhu     - Receive temperature data`);
  console.log(`   POST /api/data/ph       - Receive pH data`);
  console.log(`   POST /api/data/tds      - Receive TDS data`);
  console.log(`   POST /api/data/pompa    - Receive pump status`);
  console.log(`   GET  /api/status/all    - All sensors status`);
  console.log(`   GET  /api/device/info   - Device information`);
  console.log(`   GET  /api/health        - Server health check`);
  console.log("=".repeat(60));
  console.log("🔧 Sensor Tracking: Individual sensor timeout (30s)");
  console.log("📊 Data Storage: 100 latest readings per sensor");
  console.log("=".repeat(60));
});
