var express = require('express');
var router = express.Router();
var userModel = require('../models/user')
var radioModel = require('../models/radio')
var request = require('sync-request');
var  btoa  = require ( 'btoa' ) ; 
var mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();


/* --------------------------------------------------------- */
/* GESTION API SPOTIFY */

/* function pour refresh les tokens */

async function refreshTokens(idSpotify) {

  const credsB64 = btoa(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`);
  const user = await userModel.find({musicAccounts:{$elemMatch:{platfornUserID: idSpotify}}})
  const refreshToken = user[0].musicAccounts[0].refreshToken
  
  var requestSpotify = request('POST','https://accounts.spotify.com/api/token',{
    headers:{
      'Authorization': `Basic ${credsB64}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body:`grant_type=refresh_token&refresh_token=${refreshToken}`
  })
  var newToken = JSON.parse(requestSpotify.getBody())
  
  await userModel.updateOne(
    {musicAccounts:{$elemMatch:{platfornUserID: idSpotify}}},
    { $set: {"musicAccounts.$.accessToken": newToken.access_token}}
  )
}

/* connection Spotify  */

router.get('/autorisation',function(req,res,next){
res.json({clientId : process.env.SPOTIFY_CLIENT_ID, redirectURI: process.env.EXPO_REDIRECT_URI, clientSecret: process.env.SPOTIFY_CLIENT_SECRET})
}) 

/* recuperation information user + token */

router.post('/saveToken',async function(req,res,next){
    var requestSpotify = request('GET','https://api.spotify.com/v1/me',{
      headers:{
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer '+req.body.accessToken
      }
    })
    var reponse = JSON.parse(requestSpotify.getBody())
    var user = await userModel.findOne({email: reponse.email})
    if(user){
      res.json({result:"l'utilisateur existe déjà"})
    }else{
          var newUser = new userModel({
      email: reponse.email
    })
      newUser.musicAccounts.push({
        platfornUserID:reponse.id,
        platformURI:reponse.uri,
        refreshToken:req.body.refreshToken,
        accessToken:req.body.accessToken,
        namePlatform:'spotify'
      })
      await newUser.save()
      res.json({result:true,userInfo:newUser})
    }
  }) 
  

/* --------------------------------------------------------- */
/* SIGN-IN & SIGN-UP */

/* POST sign-in */

router.post('/sign-in',async function(req, res, next) {
  var result = false
  var user = null
  var error = []
  
  if(req.body.emailFromFront == ''
  || req.body.passwordFromFront == ''
  ){
    error.push('champs vides')
  }

  if(error.length == 0){
    const user = await userModel.findOne({
      email: req.body.emailFromFront,
      password: req.body.passwordFromFront
    })
    
    if(user){
      result = true
    } else {
      error.push('email ou mot de passe incorrect')
    }
    res.json({result, user, error})
  }
});

/* POST sign-up */

router.post('/sign-up', async function(req, res, next) {
  var user = await userModel.find({email:req.body.email})
  if(user.length > 0){
    await userModel.updateMany(
      {email: req.body.email},
      {
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        email: req.body.email,
        password: req.body.password,
      }
    )
    var update = await userModel.find({email:req.body.email})
    res.json({result:update})
  }else{
    var newUser = await new userModel({
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      email: req.body.email,
      password: req.body.password,
    })
      await newUser.save()
      res.json({result:true,dataUser:newUser});
  }
});

/* recuperation donnée pour le sign-up */

router.post('/infoSignUp',async function(req,res,next){
  var user = await userModel.find({email:req.body.email})
  res.json({infoUser:user})
})


/* --------------------------------------------------------- */
/* PAGES */
/* --------------------------------------------------------- */

/* --------------------------------------------------------- */
/* GET home page === radio page */

router.get('/', function(req, res, next) {
  // Backend affiché sur Heroku
  res.render('index', { title: 'Playdio' });
});

/* --------------------------------------------------------- */
/* POST search user  */

router.post('/userList',async function(req, res, next) {
  var regex = new RegExp('^'+req.body.firstName+'.*','i')
  var search = await userModel.find({firstName:{$regex: regex}})
  res.json({userList:search})
});

/* POST user list playlist  */

router.post('/userListplaylist',async function(req, res, next) {

  var user = await radioModel.find({_id:req.body.playlistID}).populate("userInfo.userID").exec()
  res.json({userList:user[0]})
});

/* POST user admin  */

router.post('/userAdmin',async function(req, res, next) {
  await radioModel.updateOne(
    {name:req.body.namePlaylist,
    userInfo:{$elemMatch:{userID: req.body.idUser}}},
    { $set: {"userInfo.$.gradeType": req.body.gradeType}})
  res.json({userList:true})
});

/* POST delete user  */

router.post('/deleteUser',async function(req, res, next) {
  var deleteUser = await radioModel.update(
    {name:req.body.namePlaylist},
    {$pull:{userInfo:{_id:req.body.idDelete}}}
    )
  res.json()
});

/* POST add user  */

router.post('/addUser',async function(req, res, next) {

  var addUser = await radioModel.updateOne(
    {_id:req.body.playlistId},
    { $push: {"userInfo":
              {
                userID:req.body.idUser,
                like:0,
                gradeType:"public"
              }}}
    )
  res.json()
});

/* --------------------------------------------------------- */
/* POST radio */

router.post('/radio', async function(req, res, next) {
  var userId = req.body.userId;
  var discoverRadio = await radioModel.find();
  var myRadio = await radioModel.find({userInfo:{$elemMatch:{userID: userId, gradeType:"composer"}}});
  var communityRadio = await radioModel.find({userInfo:{$elemMatch:{userID: userId, gradeType: "bandmaster"||"public"}}});
  res.json({discoverRadio, myRadio, communityRadio})
});

/* POST radio playlist from DB */

router.post('/radio-playlist', async function(req, res, next) {
  var userId = req.body.userId;
  var radioId = req.body.radioId;
  var radio = await radioModel.findOne({_id: radioId})
  res.json(radio)
});


/* --------------------------------------------------------- */
/* SEARCH with Spotify */

/* POST user playlist */

router.post('/user-playlist', async function(req, res, next) {
          /*information a mettre en dur pour l'instant. il faudra créer un store pour recuperer cette donnée  */
          var idSpotify = req.body.idSpotify
          /* function qui verrifie si le tocken access et valable */
          await refreshTokens(idSpotify)
          /* recuperation du token access a partir de la bdd */
          const user = await userModel.find({musicAccounts:{$elemMatch:{platfornUserID: idSpotify}}})
          const userAccessToken =  user[0].musicAccounts[0].accessToken
          /* request vers spotify */

      let userIdSpotify=req.body.idSpotify

      var requestPlaylist = request('GET',`https://api.spotify.com/v1/users/${userIdSpotify}/playlists`,{
        headers:
            {
            'Authorization': 'Bearer '+userAccessToken,
            },
          })
        var response = JSON.parse(requestPlaylist.getBody())
          
  res.json({response})
});

/* POST Spotify Search */

router.post('/user-search',async function(req, res, next) {

          /*information a mettre en dur pour l'instant. il faudra créer un store pour recuperer cette donnée  */
          var idSpotify = req.body.userId
          /* function qui verrifie si le tocken access et valable */
          await refreshTokens(idSpotify)
          /* recuperation du token access a partir de la bdd */
          const user = await userModel.find({musicAccounts:{$elemMatch:{platfornUserID: idSpotify}}})
          const userAccessToken =  user[0].musicAccounts[0].accessToken
          /* request vers spotify */

  let title = req.body.search_term
  var requestPlaylist = request('GET',`https://api.spotify.com/v1/search?q=${title}&type=track`,{
    headers:
        { 
        'cache-control': 'no-cache',
        'Authorization': 'Bearer '+userAccessToken,
        'content-type': 'application/json',
        accept: 'application/json' },
      })
    var response = JSON.parse(requestPlaylist.getBody())
    
    res.json({response})
  });
  

/* POST playlist item */

router.post('/playlist-item',async function(req, res, next) {

            /*information a mettre en dur pour l'instant. il faudra créer un store pour recuperer cette donnée  */
            var idSpotify = req.body.idSpotify
            /* function qui verrifie si le tocken access et valable */
            await refreshTokens(idSpotify)
            /* recuperation du token access a partir de la bdd */
            const user = await userModel.find({musicAccounts:{$elemMatch:{platfornUserID: idSpotify}}})
            const userAccessToken =  user[0].musicAccounts[0].accessToken
            /* request vers spotify */

    let playlist_id = req.body.idPlayslistSpotifyFromFront
  
    var requestPlaylist = request('GET',`https://api.spotify.com/v1/playlists/${playlist_id}/tracks`,{
      headers:
          { 
          'Authorization': 'Bearer '+userAccessToken,
          accept: 'application/json' },
        })

      var response = JSON.parse(requestPlaylist.getBody())
      res.json({response})
    });
    


/* --------------------------------------------------------- */
/* POST radio create */

router.post('/radio-create',async function(req, res, next) {

let data = req.body.resultat
let datatDecoded = decodeURIComponent(data)
let dataResult = JSON.parse(datatDecoded)

var idSpotifyFromBase = await userModel.findOne(
  { email: dataResult.infoUser.email }
  )

let test ="stringAafficher";
let name = dataResult.name

  var newRadio = await new radioModel({
    name: dataResult.name,
    private: dataResult.isPrivate,
    link: test,
    avatar:dataResult.listMusic[0].image,
    livePossible:true,
    tracks:dataResult.listMusic, 
  })
      newRadio.userInfo.push({
        gradeType: "composer",
        like:0,
        userID:idSpotifyFromBase._id
      })
  
 await newRadio.save()

var idRadio = await radioModel.findOne(
  { name: name}, {userInfo:{$elemMatch:{userID: idSpotifyFromBase._id}}}
  )

res.json({result:true,idRadio:idRadio._id})

res.json({response:"ok back"})

});


/* --------------------------------------------------------- */
/* POST radio delete */

router.post('/radio-delete', async function(req, res, next) {

  var radioId = req.body.radioId;
  var result = await radioModel.deleteOne({_id: radioId});

  res.json(result)

});


/* --------------------------------------------------------- */
/* POST playlist in Play screen */
router.post('/play', async function(req, res, next) {


  /* idPlaylist posted from Front */ 
  var idPlaylist = req.body.idPlaylist;
  /* idSpotify posted from Front */ 
  var idSpotify = req.body.idSpotify;
  await refreshTokens(idSpotify);
  /* Recuperation of the access token from DB */
  const user = await userModel.find({musicAccounts:{$elemMatch:{platfornUserID: idSpotify}}});
  const userAccessToken =  user[0].musicAccounts[0].accessToken;

  /* Spotify playlist request */
  var requestPlaylist = request('GET',`https://api.spotify.com/v1/playlists/${idPlaylist}/tracks`,{
    headers:
        { 
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer '+userAccessToken
        }
    }
  )
  var response = JSON.parse(requestPlaylist.getBody())
  res.json({response: response, userAccessToken: userAccessToken})

});



module.exports = router;


// ********************************************************************
// ANNEXE
// ********************************************************************


/* example de request spotify */

router.get('/exempleRequest',async function(req, res, next) {
  /*information a mettre en dur pour l'instant. il faudra créer un store pour recuperer cette donnée  */
  var idSpotify = 'idSpotify'
  /* info dynamique que la requette a besoin */
  var artist = "artist"
  var typeInfo = "track"
  /* function qui verifie si le tocken access et valable */
  await refreshTokens(idSpotify)
  /* recuperation du token access a partir de la bdd */
  const user = await userModel.find({musicAccounts:{$elemMatch:{platfornUserID: idSpotify}}})
  const userAccessToken =  user[0].musicAccounts[0].accessToken
  /* request vers spotify */
  var requestSpotify = request('GET','https://api.spotify.com/v1/search?q='+artist+'&type='+typeInfo,{
    headers:{
      'Authorization': 'Bearer '+userAccessToken,
    },
  })
  var response = JSON.parse(requestSpotify.getBody())
  /* renvoi du json vers le front */
  res.json({result:response})
});