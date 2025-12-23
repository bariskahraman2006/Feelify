const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log(' MongoDB Bağlantısı Başarılı!');
    } catch (error) {
        console.error(' MongoDB Bağlantı Hatası:', error.message);
        process.exit(1); // Hata varsa uygulamayı durdur
    }
};

module.exports = connectDB;