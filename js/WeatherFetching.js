function guessZipCode(){
  // Skip geolookup until replaced with TWC (wunderground api dead)
  return;

  var zipCodeElement = getElement("zip-code-text");
  // Before filling with auto zip, check and see if
  // there is already an input
  if(zipCodeElement.value != ""){
    return;
  }

  // always use wunderground API for geolookup
  // only valid equivalent is GET v3/location/search
  // TODO: use TWC API GET v3/location/search instead of wunderground geolookup
  fetch(`https://api.wunderground.com/api/${CONFIG.secrets.wundergroundAPIKey}/geolookup/q/autoip.json`)
    .then(function(response) {
      //check for error
      if (response.status !== 200) {
        console.log("zip code request error");
        return;
      }
      response.json().then(function(data) {
        // Only fill zip if the user didn't touch
        // the box while the zip was fetching
        if(zipCodeElement.value == ""){
          zipCodeElement.value = data.location.zip;
        }
      });
    })
}

function fetchAlerts(cb){
  var alertCrawl = "";
  fetch(`https://api.weather.gov/alerts/active?point=${latitude},${longitude}`)
    .then(function(response) {
        if (response.status !== 200) {
            console.warn("Alerts Error, no alerts will be shown");
        }
      response.json().then(function(data) {
        if (data.features == undefined){
          if (cb) cb(); return;
        }
        if (data.features.length == 1) {
          alerts[0] = data.features[0].properties.event + '<br>' + data.features[0].properties.description.replace("..."," ").replace(/\*/g, "")
          for(var i = 0; i < data.features.length; i++){
            /* Take the most important alert message and set it as crawl text
            This will supply more information i.e. tornado warning coverage */
            alertCrawl = alertCrawl + " " + data.features[i].properties.description.replace("...", " ");
          }
        }
        else {
          for(var i = 0; i < data.features.length; i++){
            /* Take the most important alert message and set it as crawl text
            This will supply more information i.e. tornado warning coverage */
            alertCrawl = alertCrawl + " " + data.features[i].properties.description.replace("...", " ");

            alerts[i] = data.features[i].properties.event
          }
        }
        if(alertCrawl != ""){
          CONFIG.crawl = alertCrawl;
        }
        alertsActive = alerts.length > 0;
        if (cb) cb();
      }).catch(function(){ if (cb) cb(); });
    }).catch(function(){ if (cb) cb(); });
}

// ── WMO weather code helpers (replaces dead TWC API) ─────────────────────────
function _wmoCondition(code) {
  const m = {0:'Clear',1:'Mainly Clear',2:'Partly Cloudy',3:'Cloudy',45:'Foggy',48:'Icy Fog',
    51:'Light Drizzle',53:'Drizzle',55:'Heavy Drizzle',56:'Freezing Drizzle',57:'Freezing Drizzle',
    61:'Light Rain',63:'Rain',65:'Heavy Rain',66:'Freezing Rain',67:'Heavy Freezing Rain',
    71:'Light Snow',73:'Snow',75:'Heavy Snow',77:'Snow Grains',
    80:'Rain Showers',81:'Rain Showers',82:'Heavy Showers',
    85:'Snow Showers',86:'Heavy Snow Showers',
    95:'Thunderstorm',96:'Thunderstorm/Hail',99:'Thunderstorm/Hail'};
  return m[code] || 'Unknown';
}
function _wmoIcon(code, day) {
  if (code===0)  return day ? 32 : 31;
  if (code===1)  return day ? 34 : 33;
  if (code===2)  return day ? 30 : 29;
  if (code===3)  return 26;
  if (code===45||code===48) return 20;
  if (code>=51&&code<=55) return 9;
  if (code===56||code===57) return 8;
  if (code===61) return 11;
  if (code===63||code===65) return 12;
  if (code===66||code===67) return 10;
  if (code===71) return 14;
  if (code===73) return 16;
  if (code===75) return 41;
  if (code===77) return 15;
  if (code>=80&&code<=82) return 40;
  if (code===85||code===86) return 46;
  if (code===95) return 38;
  if (code===96||code===99) return 35;
  return day ? 32 : 31;
}
function _wmoPrecipType(code) {
  if (code>=71&&code<=77) return 'Snow';
  if (code===85||code===86) return 'Snow';
  if (code===95||code===96||code===99) return 'Rain';
  return 'Rain';
}
function _degToCardinal(deg) {
  const d=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return d[Math.round(deg/22.5)%16];
}
function _dewPoint(tempF, rh) {
  const c=(tempF-32)*5/9, a=17.27, b=237.7;
  const alpha=(a*c)/(b+c)+Math.log(rh/100);
  return Math.round((b*alpha/(a-alpha))*9/5+32);
}

function fetchForecast(cb){
  const units = CONFIG.units==='m' ? '&temperature_unit=celsius&wind_speed_unit=kmh' : '&temperature_unit=fahrenheit&wind_speed_unit=mph';
  const speedUnit = CONFIG.units==='m' ? 'km/h' : 'mph';
  fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max${units}&forecast_days=10&timezone=auto`)
    .then(function(r){ return r.json(); })
    .then(function(data) {
      const d = data.daily;
      // 4 forecast periods: today-day, tonight, tomorrow-day, tomorrow-night
      const dayNow = new Date().getHours() >= 18; // rough "is it evening" check
      const periods = [
        {code:d.weather_code[0], temp:d.temperature_2m_max[0], pop:d.precipitation_probability_max[0]},
        {code:d.weather_code[0], temp:d.temperature_2m_min[0], pop:d.precipitation_probability_max[0]},
        {code:d.weather_code[1], temp:d.temperature_2m_max[1], pop:d.precipitation_probability_max[1]},
        {code:d.weather_code[1], temp:d.temperature_2m_min[1], pop:d.precipitation_probability_max[1]},
      ];
      for (var i=0; i<4; i++) {
        var isNight = (i%2===1);
        forecastTemp[i]      = Math.round(periods[i].temp);
        forecastIcon[i]      = _wmoIcon(periods[i].code, !isNight);
        forecastNarrative[i] = _wmoCondition(periods[i].code)+'. High '+Math.round(d.temperature_2m_max[Math.floor(i/2)])+'°. Low '+Math.round(d.temperature_2m_min[Math.floor(i/2)])+'°.';
        forecastPrecip[i]    = `${periods[i].pop||0}% Chance<br/> of ${_wmoPrecipType(periods[i].code)}`;
      }
      isDay = !dayNow;
      // 7-day outlook (days 1–7)
      for (var j=0; j<7; j++) {
        var idx=j+1;
        outlookHigh[j]      = Math.round(d.temperature_2m_max[idx]);
        outlookLow[j]       = Math.round(d.temperature_2m_min[idx]);
        var cond            = _wmoCondition(d.weather_code[idx]).replace('Thunderstorm','Thunder<br/>storm');
        outlookCondition[j] = cond.split(' ').join('<br/>');
        outlookIcon[j]      = _wmoIcon(d.weather_code[idx], true);
      }
      if (cb) cb(); else fetchRadarImages();
    })
    .catch(function(err){ console.error('Forecast error:', err); if (cb) cb(); });
}

function fetchCurrentWeather(){
  // ── Open-Meteo + Zippopotam (replaces dead TWC API) ──────────────────────
  const units = CONFIG.units==='m' ? '&temperature_unit=celsius&wind_speed_unit=kmh' : '&temperature_unit=fahrenheit&wind_speed_unit=mph';
  const speedUnit = CONFIG.units==='m' ? 'km/h' : 'mph';

  // Step 1: zip → lat/lon via zippopotam.us (free, no key)
  var geoUrl = CONFIG.locationMode==='AIRPORT'
    ? `https://api.zippopotam.us/airport/${airportCode}`
    : `https://api.zippopotam.us/us/${zipCode}`;

  fetch(geoUrl)
    .then(function(r){
      if (!r.ok) { alert('Location not found!'); return Promise.reject('geo'); }
      return r.json();
    })
    .then(function(geo) {
      if (CONFIG._stationOverride) {
        cityName = CONFIG._stationOverride.toUpperCase();
      } else {
        cityName = (geo.places[0]['place name'] || geo.places[0].city || zipCode).toUpperCase();
      }
      latitude  = parseFloat(geo.places[0].latitude);
      longitude = parseFloat(geo.places[0].longitude);

      // Step 2: current conditions from Open-Meteo
      return fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,surface_pressure,weather_code,wind_speed_10m,wind_direction_10m,is_day${units}&forecast_days=1`);
    })
    .then(function(r){ return r.json(); })
    .then(function(data) {
      var c = data.current;
      isDay            = c.is_day === 1;
      currentTemperature = Math.round(c.temperature_2m);
      currentCondition = _wmoCondition(c.weather_code);
      currentIcon      = _wmoIcon(c.weather_code, isDay);
      windSpeed        = `${_degToCardinal(c.wind_direction_10m)} ${Math.round(c.wind_speed_10m)} ${speedUnit}`;
      gusts            = 'NONE';
      feelsLike        = Math.round(c.apparent_temperature);
      humidity         = c.relative_humidity_2m;
      dewPoint         = _dewPoint(currentTemperature, humidity);
      visibility       = 10;
      pressure         = (c.surface_pressure * 0.02953).toFixed(2);
      pressureTrend    = '';
      // Fire alerts + forecast in parallel; start sequence when both finish
      var _done = 0;
      function _onDone() { if (++_done === 2) fetchRadarImages(); }
      fetchAlerts(_onDone);
      fetchForecast(_onDone);
    })
    .catch(function(err){ if(err!=='geo') console.error('Weather error:', err); });
}

function fetchRadarImages(){
  radarImage = document.createElement("iframe");
  radarImage.onerror = function () {
    getElement('radar-container').style.display = 'none';
  }

  mapSettings = btoa(JSON.stringify({
    "agenda": {
      "id": "weather",
      "center": [longitude, latitude],
      "location": null,
      "zoom": 8
    },
    "animating": true,
    "base": "standard",
    "artcc": false,
    "county": false,
    "cwa": false,
    "rfc": false,
    "state": false,
    "menu": false,
    "shortFusedOnly": false,
    "opacity": {
      "alerts": 0.0,
      "local": 0.0,
      "localStations": 0.0,
      "national": 0.6
    }
  }));
  radarImage.setAttribute("src", "https://radar.weather.gov/?settings=v1_" + mapSettings);
  radarImage.style.width = "1230px"
  radarImage.style.height = "740px"
  radarImage.style.marginTop = "-220px"
  radarImage.style.overflow = "hidden"
  
  if(alertsActive){
    zoomedRadarImage = new Image();
    zoomedRadarImage.onerror = function () {
      getElement('zoomed-radar-container').style.display = 'none';
    }

    zoomedRadarImage = document.createElement("iframe");
    zoomedRadarImage.onerror = function () {
      getElement('zoomed-radar-container').style.display = 'none';
    }
  
    mapSettings = btoa(JSON.stringify({
      "agenda": {
        "id": "weather",
        "center": [longitude, latitude],
        "location": null,
        "zoom": 10
      },
      "animating": true,
      "base": "standard",
      "artcc": false,
      "county": false,
      "cwa": false,
      "rfc": false,
      "state": false,
      "menu": false,
      "shortFusedOnly": false,
      "opacity": {
        "alerts": 0.0,
        "local": 0.0,
        "localStations": 0.0,
        "national": 0.6
      }
    }));
    zoomedRadarImage.setAttribute("src", "https://radar.weather.gov/?settings=v1_" + mapSettings);
    zoomedRadarImage.style.width = "1230px"
    zoomedRadarImage.style.height = "740px"
    zoomedRadarImage.style.marginTop = "-220px"
    zoomedRadarImage.style.overflow = "hidden"
  }

  scheduleTimeline();
}