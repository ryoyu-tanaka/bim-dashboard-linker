// server.js

// ===== 1. 必要なモジュール読み込み =====
const path = require('path');
const express = require('express');
const cors = require('cors');
const { BigQuery } = require('@google-cloud/bigquery');
require('dotenv').config();  // ← .env を読み込む

// ===== 2. Express 初期化 =====
const app = express();
app.use(cors());
app.use(express.json());


// ===== 3. BigQuery 設定（.env から読む） =====
const bigquery = new BigQuery({
    projectId: process.env.GOOGLE_PROJECT_ID,
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    }
});

// ===== 4. frontend を配信する設定 =====
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});


// =======================================================
// 🪑 座席稼働率API
// =======================================================
app.get("/api/seat-usage", async (req, res) => {
    const { shop_name, start, end } = req.query;

    const sql = `
    SELECT
      shop_name,
      seat_id,
      use_flg,
      usedate
    FROM
      \`bim-digitaltwin.facility_data.vw_seat_usage_merged\`
    WHERE
      TRIM(shop_name) = TRIM(@shop_name)
      AND DATE(usedate) BETWEEN CAST(@start AS DATE) AND CAST(@end AS DATE)
    ORDER BY usedate, seat_id
  `;

    const options = {
        query: sql,
        params: { shop_name, start, end }
    };

    try {
        console.log("🟢 BigQuery SQL:", sql, options.params);
        const [rows] = await bigquery.query(options);
        console.log(`✅ ${rows.length} rows fetched`);
        res.json(rows);
    } catch (err) {
        console.error("❌ BigQuery Error:", err);
        res.status(500).json({ error: "BigQuery query failed", details: err.message });
    }
});

// =======================================================
// ⚡ 電力量API（全階集計）
// =======================================================
app.get("/api/electricity", async (req, res) => {
    const { floor_min = 1, floor_max = 9, start, end } = req.query;

    const sql = `
    SELECT
      floor,
      AVG(power_kwh) AS kwh_avg,
      SUM(power_kwh) AS kwh_sum
    FROM
      \`bim-digitaltwin.facility_data.v_electricity_L_T_1to9F_long\`
    WHERE
      floor BETWEEN @floor_min AND @floor_max
      AND TIMESTAMP(datetime) BETWEEN TIMESTAMP(@start) AND TIMESTAMP(@end)
    GROUP BY floor
    ORDER BY floor
  `;

    const options = {
        query: sql,
        params: {
            floor_min: Number(floor_min),
            floor_max: Number(floor_max),
            start,
            end
        }
    };

    try {
        console.log("⚡ BigQuery 電力量 SQL:", sql, options.params);
        const [rows] = await bigquery.query(options);
        console.log(`✅ 電力量データ ${rows.length}件取得`);
        res.json(rows);
    } catch (err) {
        console.error("❌ BigQuery Error (electricity):", err);
        res.status(500).json({
            error: "BigQuery electricity query failed",
            details: err.message
        });
    }
});


// =======================================================
// 🕒 新API②：時間帯別電力量（1階層指定）
// =======================================================
app.get("/api/electricity/timeslot", async (req, res) => {
    const { floor } = req.query;

    const sql = `
    SELECT
      time_slot,
      kwh_avg
    FROM
      \`bim-digitaltwin.facility_data.vw_electricity_timeslot\`
    WHERE
      floor = @floor
    ORDER BY time_slot
  `;

    const options = {
        query: sql,
        params: { floor: parseInt(floor) }
    };

    try {
        console.log("⏱️ BigQuery 時間帯SQL:", sql, options.params);
        const [rows] = await bigquery.query(options);
        console.log(`✅ 時間帯データ ${rows.length}件取得`);
        res.json(rows);
    } catch (err) {
        console.error("❌ BigQuery Error (timeslot):", err);
        res.status(500).json({
            error: "BigQuery timeslot query failed",
            details: err.message
        });
    }
});

// ==============================================
// 🔹 新API: 各階の時間帯別平均電力量
// ==============================================
app.get("/api/electricity/hourly", async (req, res) => {
    const { floor_min = 1, floor_max = 9, start, end } = req.query;

    const sql = `
    SELECT
      floor,
      EXTRACT(HOUR FROM datetime) AS hour,
      AVG(power_kwh) AS kwh_avg
    FROM
      \`bim-digitaltwin.facility_data.v_electricity_L_T_1to9F_long\`
    WHERE
      floor BETWEEN @floor_min AND @floor_max
      AND datetime BETWEEN TIMESTAMP(@start) AND TIMESTAMP(@end)
    GROUP BY floor, hour
    ORDER BY floor, hour
  `;

    const options = {
        query: sql,
        params: {
            floor_min: Number(floor_min),
            floor_max: Number(floor_max),
            start,
            end,
        },
    };

    try {
        console.log("⚡ BigQuery 電力量（時間別）SQL params:", options.params);
        const [rows] = await bigquery.query(options);
        console.log(`✅ 時間別データ ${rows.length}件取得`);
        res.json(rows);
    } catch (err) {
        console.error("❌ BigQuery Error (hourly):", err);
        res.status(500).json({ error: "BigQuery hourly query failed", details: err.message });
    }
});


// ==============================================
// 🔹 新API: 日別合計電力量（全階）
// ==============================================
app.get("/api/electricity/daily", async (req, res) => {
    const { floor_min = 1, floor_max = 9, start, end } = req.query;

    const sql = `
    SELECT
      DATE(datetime) AS date,
      floor,
      SUM(power_kwh) AS kwh_sum,
      AVG(power_kwh) AS kwh_avg
    FROM
      \`bim-digitaltwin.facility_data.v_electricity_L_T_1to9F_long\`
    WHERE
      floor BETWEEN @floor_min AND @floor_max
      AND datetime BETWEEN TIMESTAMP(@start) AND TIMESTAMP(@end)
    GROUP BY date, floor
    ORDER BY date, floor
  `;

    const options = {
        query: sql,
        params: {
            floor_min: Number(floor_min),
            floor_max: Number(floor_max),
            start,
            end,
        },
    };

    try {
        console.log("📅 BigQuery 電力量（日別）SQL:", options.params);
        const [rows] = await bigquery.query(options);
        console.log(`✅ 日別データ ${rows.length}件取得`);
        res.json(rows);
    } catch (err) {
        console.error("❌ BigQuery Error (daily):", err);
        res.status(500).json({ error: "BigQuery daily query failed", details: err.message });
    }
});

// =======================================================
// 🧱 1️⃣ 年度×工種別コスト
// =======================================================
app.get("/api/work/year-category", async (req, res) => {
    const sql = `
    SELECT * FROM \`bim-digitaltwin.facility_data.v_year_category_cost\`
    ORDER BY year, category
  `;
    try {
        const [rows] = await bigquery.query(sql);
        res.json(rows);
    } catch (err) {
        console.error("❌ BigQuery year-category:", err);
        res.status(500).json({ error: err.message });
    }
});

// =======================================================
// 🏢 2️⃣ 階別工事件数
// =======================================================
app.get("/api/work/floor-count", async (req, res) => {
    const sql = `
    SELECT * FROM \`bim-digitaltwin.facility_data.v_floor_count\`
    ORDER BY floor
  `;
    try {
        const [rows] = await bigquery.query(sql);
        res.json(rows);
    } catch (err) {
        console.error("❌ BigQuery floor-count:", err);
        res.status(500).json({ error: err.message });
    }
});

// =======================================================
// ⚙️ 3️⃣ 部位別 平均・合計コスト
// =======================================================
app.get("/api/work/part-avg", async (req, res) => {
    const sql = `
    SELECT * FROM \`bim-digitaltwin.facility_data.v_part_avg_cost\`
    ORDER BY total_cost DESC
  `;
    try {
        const [rows] = await bigquery.query(sql);
        res.json(rows);
    } catch (err) {
        console.error("❌ BigQuery part-avg:", err);
        res.status(500).json({ error: err.message });
    }
});

// =======================================================
// 📊 4️⃣ 年度×階別コスト
// =======================================================
app.get("/api/work/year-floor", async (req, res) => {
    const sql = `
    SELECT * FROM \`bim-digitaltwin.facility_data.v_year_floor_cost\`
    ORDER BY year, floor
  `;
    try {
        const [rows] = await bigquery.query(sql);
        res.json(rows);
    } catch (err) {
        console.error("❌ BigQuery year-floor:", err);
        res.status(500).json({ error: err.message });
    }
});





// =======================================================
// 🎯 工事データ一覧API（年度指定または全件）
// =======================================================
app.get("/api/work/detail", async (req, res) => {
  try {
    const yearParam = req.query.year ? Number(req.query.year) : null;

    // --- ベースクエリ ---
    let query = `
      SELECT
        _property_id_,
        property_name,
        year,
        category,
        part,
        detail,
        work_name,
        work_detail,
        reason,
        approval_note,
        contractor,
        responsible_person,
        cost_ex_tax,
        completion_date,
        status
              b1f,
      \`1f\`, \`2f\`, \`3f\`, \`4f\`, \`5f\`, \`6f\`, \`7f\`, \`8f\`, \`9f\`, \`10f\`,
      rf
      FROM facility_data.v_work_detail
    `;

    // --- 年度指定があればWHERE句を追加 ---
    const options = {};
    if (yearParam) {
      query += ` WHERE CAST(year AS INT64) = @year `;
      options.params = { year: yearParam };
    }

    console.log("📡 Executing Query:", query, options);

    const [rows] = await bigquery.query({ query, ...options });
    console.log(`✅ Work detail rows: ${rows.length}`);
    res.json(rows);
  } catch (err) {
    console.error("❌ BigQuery Error (work/detail):", err);
    res.status(500).json({ error: err.message });
  }
});





// =======================================================
// 🔑 APS Token API (OAuth v2)
// =======================================================
app.get("/api/aps/oauth/token", async (req, res) => {
    try {
        const params = new URLSearchParams();
        params.append("client_id", process.env.APS_CLIENT_ID);
        params.append("client_secret", process.env.APS_CLIENT_SECRET);
        params.append("grant_type", "client_credentials");
        params.append("scope", "data:read viewables:read");

        const response = await fetch(
            "https://developer.api.autodesk.com/authentication/v2/token",
            {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: params.toString()
            }
        );

        if (!response.ok) {
            const errText = await response.text();
            console.error("APS token fetch error:", response.status, errText);
            return res.status(500).json({
                error: "token fetch failed",
                status: response.status,
                details: errText
            });
        }

        const token = await response.json();
        res.json(token);

    } catch (err) {
        console.error("APS token exception:", err);
        res.status(500).json({ error: "token exception", details: err.message });
    }
});


// ===== 5. サーバー起動 =====
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

