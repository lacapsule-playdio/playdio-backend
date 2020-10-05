var mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

var options = {
  connectTimeoutMS: 5000,
  useNewUrlParser: true,
  useUnifiedTopology : true
}
mongoose.connect(`${process.env.MONGODB_URI}`,
    options,         
    function(err) {
    console.log(err);
    }
);

module.exports = mongoose;