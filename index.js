const express = require('express');
const app = express()
const url = '"mongodb://localhost:27017/Feelify"';

app.listen(3000,()=>{
    console.log('It working on port 3000')
})

