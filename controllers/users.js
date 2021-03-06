var express = require('express');
var moment = require('moment-timezone');
var crypto = require('crypto');
var bcrypt = require('bcryptjs');
var jade = require('jade');
var jwt = require('jsonwebtoken');
var _ = require('underscore');
var router = express.Router();

var config  = require('../config');
var H = require('../helpers');

var User = require('../models/user');

var mailer = require('../mailer');


router.get('/',H.assertPermission('users','read'),
function(request,response){
  User.find({},{
    __v:false,
    email_verification_code:false,
    reset_password:false,
    password:false
  },function(err,users){
    if(err)
      response.status(400).json(H.response(400,'Error while fetching users',null,err));
    else
      response.status(200).json(H.response(200,'Success',users));
  });
});

router.get('/:user_id',H.assertPermission('users','read'),
function(request,response){
  User.findById(request.params.user_id,{
    __v:false,
    email_verification_code:false,
    reset_password:false,
    password:false
  },function(err,user){
    if(err)
      response.status(400).json(H.response(400,'Error while fetching users',null,err));
    else if(user == null)
      response.status(404).json(H.response(404,'User not found'));
    else
      response.status(200).json(H.response(200,'Success',user));
  });
});

router.post('/',function(request,response){
  // This endpoint is public
    var data = request.body;
    var user = new User({
      email : data.email,
      first_name : data.first_name,
      last_name : data.last_name,
      mobile : data.mobile,
      timezone : data.timezone,
      city : data.city,
      technologies:data.technologies,
      email_verified_at:null,
      email_verification_code: parseInt(crypto.randomBytes(2).toString('hex'),16),
      created_at:moment(),
      updated_at:moment()
    });
    var validationError = user.validateSync();
    var errors = [];
    if(validationError)
    {
      for(key in validationError.errors)
        errors.push({field:key,message:validationError.errors[key].message});
    }
    if( ! (data.password && data.password.length > 5) )
      errors.push({field:'password',message:'Password must be larger than 5 characters.'});
    else
      user.password = bcrypt.hashSync(data.password,8);
    if(errors.length > 0)
      response.status(422).json(H.response(422,'Invalid data',null,errors));
    else
    user.save(function(err){
      if(err)
      {
        var errors = [];
        for(key in err.errors)
          errors.push({field:key,message:err.errors[key].message});
        response.status(400).json(H.response(400,'Error while saving user',null,errors));
      }
      else
      {
        response.status(201).json(H.response(201,'User created successfully',{_id:user._id}));
        mailer.send({
          from : config.mail.from,
          to : user.email,
          subject : jade.renderFile('emails/users/welcome/subject.jade',{user:user,config:config}),
          html : jade.renderFile('emails/users/welcome/html.jade',{user:user,config:config}),
          text : jade.renderFile('emails/users/welcome/text.jade',{user:user,config:config})
        },function(err,message){
          if(err)
            console.log('Error while sending welcome email : \n',err)
        });
        mailer.send({
          from : config.mail.from,
          to : user.email,
          subject : jade.renderFile('emails/users/verification/subject.jade',
            {user:user,config:config,verificationCode:user.email_verification_code}),
          html : jade.renderFile('emails/users/verification/html.jade',
            {user:user,config:config,verificationCode:user.email_verification_code}),
          text : jade.renderFile('emails/users/verification/text.jade',
          {user:user,config:config,verificationCode:user.email_verification_code})
        },function(err,message){
          if(err)
            console.log('Error while sending verification email : \n',err)
        });
      }
    });
})

router.put('/',H.assertAuthorised(),function(request,response){
  var data = request.body;
  User.findById(request.authorisedUser._id,{
    __v:false,
    email_verification_code:false,
    password:false
  },function(err,user){
    if(err)
      response.status(400).json(H.response(400,'Error while fetching users',null,err));
    else if(user == null)
      response.status(404).json(H.response(404,'User not found'));
    else {
        for(i in User.userUpdatables)
        {
          var field = User.userUpdatables[i];
          if(data[field])
            user[field] = data[field];
        }
        if( ! (data.password && data.password.length > 5) ){
          response.status(422).json(H.response(422,'Invalid data',null,[
              {field:'password',message:'Password must be larger than 5 characters.'}]));
        } else {
            user.password = bcrypt.hashSync(data.password,8);
            user.updated_at = moment();
            user.save(function(err){
              if(err)
              {
                if(err.name == "ValidationError")
                {
                  var errors = [];
                  for(key in err.errors)
                    errors.push({field:key,message:err.errors[key].message});
                  response.status(422).json(H.response(422,'Invalid data',null,errors));
                }
                else
                  response.status(400).json(H.response(400,'Error while updating user'));
              }
              else
                response.status(200).json(H.response(200,'User updated successfully',{_id:user._id}));
            });
        }
    }
  });
});

router.put('/:user_id',H.assertPermission('users','update'),
function(request,response){
    var data = request.body;
    User.findById(request.params.user_id,{
      __v:false,
      email_verification_code:false,
      password:false
    },function(err,user){
      if(err)
        response.status(400).json(H.response(400,'Error while fetching users',null,err));
      else if(user == null)
        response.status(404).json(H.response(404,'User not found'));
      else {
          for(i in User.userUpdatables)
          {
            var field = User.userUpdatables[i];
            if(data[field])
              user[field] = data[field];
          }
          if( ! (data.password && data.password.length > 5) ){
            response.status(422).json(H.response(422,'Invalid data',null,[
                {field:'password',message:'Password must be larger than 5 characters.'}]));
          } else {
              user.password = bcrypt.hashSync(data.password,8);
              user.updated_at = moment();
              user.save(function(err){
                if(err)
                {
                  if(err.name == "ValidationError")
                  {
                    var errors = [];
                    for(key in err.errors)
                      errors.push({field:key,message:err.errors[key].message});
                    response.status(422).json(H.response(422,'Invalid data',null,errors));
                  }
                  else
                    response.status(400).json(H.response(400,'Error while updating user'));
                }
                else
                  response.status(200).json(H.response(200,'User updated successfully',{_id:user._id}));
              });
          }
      }
    });
});

router.post('/forgot_password',function(request,response){
  // This endpoint is public
  User.findOne({email:request.body.email},function(err, user){
    if(err)
      response.status(400).json(H.response(400,'Error while finding user',null,err));
    else if(user == null)
      response.status(404).json(H.response(404,'User not found'))
    else{
      user.reset_password = {
          code : parseInt(crypto.randomBytes(2).toString('hex'),16),
          expires_at : moment().add(1,'days')
      };
      user.updated_at = moment();
      user.save(function(err,user){
        if(err)
          response.status(400).json(H.response(400,'Error while updating user',null,err));
        else
          response.status(200).json(H.response(200,'Reset password instructions sent',{_id:user._id}));
      });
      mailer.send({
        from : config.mail.from,
        to : user.email,
        subject : jade.renderFile('emails/users/resetPassword/subject.jade',
          {user:user,config:config,resetCode:user.reset_password.code}),
        html : jade.renderFile('emails/users/resetPassword/html.jade',
          {user:user,config:config,resetCode:user.reset_password.code}),
        text : jade.renderFile('emails/users/resetPassword/text.jade',
        {user:user,config:config,resetCode:user.reset_password.code})
      },function(err,message){
        if(err)
          console.log('Error while sending verification email : \n',err)
      });
    }
  });
});

router.post('/reset_password',function(request,response){
  // This endpoint is public
  User.findOne({email:request.body.email},function(err, user){
    if(err)
      response.status(400).json(H.response(400,'Error while finding user',null,err));
    else if(user == null)
      response.status(404).json(H.response(404,'User not found'))
    else if( !user.reset_password || moment().isAfter(user.reset_password.expires_at))
        response.status(400).json(H.response(400,'Code is expired or invalid'));
    else if( !user.reset_password || request.body.reset_code != user.reset_password.code)
        response.status(400).json(H.response(400,'Code is expired or invalid'));
    else{
        var data = request.body;
        if( ! (data.password && data.password.length > 5) ){
          response.status(422).json(H.response(422,'Invalid data',null,[
              {field:'password',message:'Password must be larger than 5 characters.'}]));
        } else {
            user.password = bcrypt.hashSync(data.password,8);
            user.reset_password = null;
            user.updated_at = moment();
            user.save(function(err,user){
            if(err)
              response.status(400).json(H.response(400,'Error while updating user',null,err));
            else
              response.status(200).json(H.response(200,'Password reset successfully.',{_id:user._id}));
            });
        }
    }
  });
});

router.post('/verify_email',function(request,response){
  // This endpoint is public
  User.findOne({email:request.body.email},function(err, user){
    if(err)
      response.status(400).json(H.response(400,'Error while finding user',null,err));
    else if(user == null)
      response.status(404).json(H.response(404,'User not found'))
    else if(user.email_verified_at)
      response.status(422).json(H.response(422,'Email has been already verified'));
    else if(user.email_verification_code != request.body.email_verification_code)
      response.status(400).json(H.response(400,'Invalid verification code',null,
        {field:'email_verification_code',message:'Invalid verification code'}));
    else{
      user.email_verified_at = moment();
      user.updated_at = moment();
      user.save(function(err,user){
        if(err)
          response.status(400).json(H.response(400,'Error while updating user',null,err));
        else
          response.status(200).json(H.response(200,'User email verified successfully',{_id:user._id}));
      });
    }
  });
});

router.post('/authenticate',function(request,response){
  // This endpoint is public
  User.findOne({email:request.body.email},function(err,user){
    if(user == null)
      response.status(404).json(H.response(404,'User not found'));
    else if(err)
      response.status(400).json(H.response(400,'Error while fetching user',null,err));
    else
    {
      if( ! user.email_verified_at)
        response.status(403).json(H.response(403,'Email not verified'));
      else if(request.body.password && bcrypt.compareSync(request.body.password,user.password))
      {
        var payload = {
          _id:user._id,
          email:user.email,
          first_name:user.first_name,
          last_name:user.last_name
        };
        var access_token = jwt.sign(payload,config.app.secret,{expiresInMinutes:120});
        response.status(200).json(H.response(200,'Success',{_id:user._id,access_token:access_token,expires_at:moment().add(120,'minute').format()}));
      }
      else
        response.status(401).json(
          H.response(401,'Invalid Credentials',null,[
            {field:'password',message:'Invalid Credentials'}
          ]));
    }
  });
});
module.exports = router;
