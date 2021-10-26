const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const databasePath = path.join(__dirname, "covid19IndiaPortal.db");

const app = express();

app.use(express.json());

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const convertStateDbObjectToResponseObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const convertDistrictDbObjectToResponseObject = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

function authenticate(request, response, next) {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
}

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const databaseUser = await database.get(selectUserQuery);
  if (databaseUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      databaseUser.password
    );
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/states/", authenticate, async (request, response) => {
  const getStatesQuery = `
    select * from state;`;
  const statesArray = await database.all(getStatesQuery);
  response.send(
    statesArray.map((eachState) =>
      convertStateDbObjectToResponseObject(eachState)
    )
  );
});

app.get("/states/:stateId/", authenticate, async (request, response) => {
  const { stateId } = request.params;
  const getstateQuery = `select * from state 
    where state_id = ${stateId};`;
  const state = await database.get(getstateQuery);
  response.send(convertStateDbObjectToResponseObject(state));
});

app.post("/districts/", authenticate, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const setDistrictQuery = `
    insert into district
    (state_id ,district_name ,cases ,cured ,active ,deaths )
    values(${stateId} ,'${districtName}' ,${cases} ,${cured} ,${active} ,${deaths} );`;
  await database.run(setDistrictQuery);
  response.send("District Successfully Added");
});

app.get("/districts/:districtId/", authenticate, async (request, response) => {
  const { districtId } = request.params;
  const getdistrictQuery = `select * from district 
    where district_id = ${districtId};`;
  const district = await database.get(getdistrictQuery);
  response.send(convertDistrictDbObjectToResponseObject(district));
});
app.delete(
  "/districts/:districtId/",
  authenticate,
  async (request, response) => {
    const { districtId } = request.params;
    const deletedistrictQuery = `delete from district 
    where district_id = ${districtId};`;
    await database.get(deletedistrictQuery);
    response.send("District Removed");
  }
);

app.put("/districts/:districtId/", authenticate, async (request, response) => {
  const { districtId } = request.params;
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const updatedistrictQuery = `UPDATE
    district
  SET
    district_name = '${districtName}',
    state_id = ${stateId},
    cases = ${cases},
    cured = ${cured},
    active = ${active}, 
    deaths = ${deaths}
  WHERE
    district_id = ${districtId};
  `;
  await database.get(updatedistrictQuery);
  response.send("District Detailss Updated");
});

app.get("/states/:stateId/stats", authenticate, async (request, response) => {
  const { stateId } = request.params;
  const getstatQuery = `select 
  sum(cases),
  sum(cured),
  sum(active),
  sum(deaths)
   from district
    where state_id = ${stateId};`;

  const stats = await database.get(getstatQuery);
  response.send({
    totalCases: stats["sum(cases)"],
    totalCured: stats["sum(cured)"],
    totalActive: stats["sum(active)"],
    totalDeaths: stats["sum(deaths)"],
  });
});

module.exports = app;
