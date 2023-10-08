const CronJob = require("node-cron");
const firebase = require("./firebase.js");

const killEventsPerHour = () => {
  //Cada hora
  const scheduledJobFunction = CronJob.schedule("0 * * * *", async () => {
    console.log("Eliminando eventos sin anomalias térmicas");
    const eventsRef = await firebase.db.collection("events").get();
    eventsRef.docs.map((doc) => {
      //Se fija si hoy hay anomalias en su area
      const box = utilities.areaCoordinates(lat, long, 2);
      const apiUrl = utilities.buildApiUrl(box, new Date());
      let thermalAnomalies = utilities.retrieveThermalAnomalies(apiUrl);
      //Se fija si hay anomalias ayer en su area
      if (thermalAnomalies.length === 0) {
        let yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayApiUrl = utilities.buildApiUrl(box, yesterday);
        thermalAnomalies = utilities.retrieveThermalAnomalies(
          yesterdayApiUrl
        );
      }
      //Si no hay, elimina el evento
      if (thermalAnomalies.length === 0) {
        doc.ref.delete();
      }
    });
  });

  scheduledJobFunction.start();
}
exports.killEventsPerHour = killEventsPerHour;