#include <WiFi.h>
#include <HTTPClient.h>

const char* ssid = "Home";
const char* password = "bayardulu";
#define SERVER_BASE_URL "http://172.16.0.76:3000"

const int relayPin = 2;
String deviceID;
bool pompaStatus = false;

unsigned long lastSendTime = 0;
const unsigned long sendInterval = 3000; // Kirim setiap 3 detik
unsigned long lastControlCheck = 0;
const unsigned long controlCheckInterval = 2000; // Cek kontrol setiap 2 detik

void setup() {
  Serial.begin(115200);
  pinMode(relayPin, OUTPUT);
  
  // PERBAIKAN: Initialize relay OFF (LOW untuk active HIGH relay)
  digitalWrite(relayPin, LOW);
  pompaStatus = false;
  
  deviceID = "POMPA_" + String(ESP.getEfuseMac(), HEX);
  
  connectToWiFi();
  Serial.println("✅ Pompa Control Ready!");
  Serial.println("Device ID: " + deviceID);
  Serial.println("Initial State: POMPA OFF - Relay LOW - LED MATI");
}

void loop() {
  // Maintain WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("🔄 Reconnecting WiFi...");
    connectToWiFi();
  }
  
  // Cek kontrol dari server
  if (millis() - lastControlCheck >= controlCheckInterval) {
    checkServerControl();
    lastControlCheck = millis();
  }
  
  // Kirim status heartbeat
  if (millis() - lastSendTime >= sendInterval) {
    sendPompaStatus();
    lastSendTime = millis();
  }
  
  delay(500);
}

void connectToWiFi() {
  Serial.println("📡 Connecting to WiFi...");
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 15) {
    delay(1000);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi Connected");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n❌ WiFi Failed");
  }
}

// PERBAIKAN: Logika relay ACTIVE HIGH
void kontrolPompa(bool status) {
  if (status) {
    // NYALA: Relay aktif HIGH = LED biru MENYALA
    digitalWrite(relayPin, HIGH);
    pompaStatus = true;
    Serial.println("💧 POMPA ON - Relay HIGH - LED MENYALA");
  } else {
    // MATI: Relay non-aktif LOW = LED biru MATI
    digitalWrite(relayPin, LOW);
    pompaStatus = false;
    Serial.println("🔴 POMPA OFF - Relay LOW - LED MATI");
  }
  
  // Debug info
  Serial.print("Relay Pin State: ");
  Serial.println(digitalRead(relayPin));
  Serial.print("Pompa Status: ");
  Serial.println(pompaStatus ? "ON" : "OFF");
  Serial.print("LED Status: ");
  Serial.println(digitalRead(relayPin) ? "MENYALA" : "MATI");
}

void checkServerControl() {
  HTTPClient http;
  String url = String(SERVER_BASE_URL) + "/api/latest/pompa";
  
  Serial.println("🔍 Checking server control...");
  
  if (http.begin(url)) {
    int httpCode = http.GET();
    Serial.print("Server response code: ");
    Serial.println(httpCode);
    
    if (httpCode == 200) {
      String response = http.getString();
      Serial.println("Server response: " + response);
      
      // Parse JSON untuk status
      int statusIndex = response.indexOf("\"status\":");
      if (statusIndex != -1) {
        String statusStr = response.substring(statusIndex + 9);
        statusStr = statusStr.substring(0, statusStr.indexOf(","));
        
        bool serverStatus = (statusStr == "true");
        
        Serial.print("Server command: ");
        Serial.println(serverStatus ? "ON" : "OFF");
        Serial.print("Current status: ");
        Serial.println(pompaStatus ? "ON" : "OFF");
        
        if (serverStatus != pompaStatus) {
          Serial.println("🔄 Executing server command...");
          kontrolPompa(serverStatus);
          
          // Kirim konfirmasi status segera
          sendPompaStatus();
        }
      } else {
        Serial.println("❌ Status field not found in response");
      }
    } else {
      Serial.println("❌ Failed to get control data");
    }
    http.end();
  } else {
    Serial.println("❌ Failed to connect to server");
  }
}

void sendPompaStatus() {
  HTTPClient http;
  String url = String(SERVER_BASE_URL) + "/api/data/pompa";
  
  String jsonData = "{" 
                   "\"deviceId\":\"" + deviceID + "\"," 
                   "\"status\":" + String(pompaStatus ? "true" : "false") + "," 
                   "\"mode\":\"manual\"," 
                   "\"wifi_rssi\":" + String(WiFi.RSSI()) + "," 
                   "\"heartbeat\":true," 
                   "\"controlled_by\":\"esp32\"," 
                   "\"timestamp\":\"" + getTimeStamp() + "\"," 
                   "\"date\":\"" + getDate() + "\"" 
                   "}";
  
  Serial.println("📤 Sending status: " + String(pompaStatus ? "ON" : "OFF"));
  Serial.println("JSON: " + jsonData);
  
  if (http.begin(url)) {
    http.addHeader("Content-Type", "application/json");
    int httpCode = http.POST(jsonData);
    
    Serial.print("HTTP Response: ");
    Serial.println(httpCode);
    
    if (httpCode == 200) {
      String response = http.getString();
      Serial.println("✅ Status sent successfully");
    } else {
      Serial.println("❌ Send failed: " + String(httpCode));
    }
    http.end();
  } else {
    Serial.println("❌ Failed to connect to server URL");
  }
}

// Helper functions untuk timestamp
String getTimeStamp() {
  unsigned long seconds = millis() / 1000;
  unsigned long minutes = seconds / 60;
  unsigned long hours = minutes / 60;
  
  seconds %= 60;
  minutes %= 60;
  hours %= 24;
  
  char timestamp[9];
  sprintf(timestamp, "%02lu:%02lu:%02lu", hours, minutes, seconds);
  return String(timestamp);
}

String getDate() {
  // Simple date simulation
  return "2024-01-01";
}