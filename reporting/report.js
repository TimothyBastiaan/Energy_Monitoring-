require('dotenv').config();
const { MongoClient } = require('mongodb');
const ExcelJS = require('exceljs');

// Configurations
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME;
const COLLECTION_NAME = process.env.COLLECTION_NAME;
const OUTPUT_FILE = 'electricity_report.xlsx';

// Generate daily report and export to Excel
async function generateDailyReportToExcel() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);
    console.log('✅ Connected to MongoDB');

    // Aggregation Pipeline to get initial and last values with timestamps and calculate daily usage
    const pipeline = [
      {
        $sort: { timestamp: 1 }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$timestamp" }
          },
          initial_value: { $first: "$values.id_28" },
          last_value: { $last: "$values.id_28" },
          initial_time: { $first: "$timestamp" },
          last_time: { $last: "$timestamp" }
        }
      },
      {
        $addFields: {
          daily_usage: { $subtract: ["$last_value", "$initial_value"] }
        }
      },
      {
        $sort: { "_id": 1 }
      }
    ];

    const report = await collection.aggregate(pipeline).toArray();
    console.log("📊 Daily Electricity Use Report Generated.");

    if (report.length === 0) {
      console.log("⚠️ No data found.");
      return;
    }

    // Create Excel Workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Electricity Report');

    // Define Header
    worksheet.columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Daily Usage (kWh)', key: 'daily_usage', width: 25 },
      { header: 'Initial Value (kWh)', key: 'initial_value', width: 25 },
      { header: 'Last Value (kWh)', key: 'last_value', width: 25 },
      { header: 'Initial Time', key: 'initial_time', width: 25 },
      { header: 'Last Time', key: 'last_time', width: 25 }
    ];

    // Add Data
    report.forEach((day) => {
      worksheet.addRow({
        date: day._id,
        daily_usage: parseFloat(day.daily_usage.toFixed(2)),
        initial_value: parseFloat(day.initial_value.toFixed(2)),
        last_value: parseFloat(day.last_value.toFixed(2)),
        initial_time: new Date(day.initial_time).toISOString(),
        last_time: new Date(day.last_time).toISOString()
      });
    });

    // Style Headers
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { horizontal: 'center' };

    // Save to File
    await workbook.xlsx.writeFile(OUTPUT_FILE);
    console.log(`✅ Report successfully saved to ${OUTPUT_FILE}`);
  } catch (error) {
    console.error("❌ Error generating report:", error);
  } finally {
    await client.close();
    console.log("🔒 Connection closed.");
  }
}

// Run the function
generateDailyReportToExcel();