var page = "home", searchq;
var F = new Firebase("http://songwalks.firebaseio.com/");
var current_sound, show_browse, page, show_compose, 
	next_flip_time, sorted_actions;
var curloc, show_pick_song;

function $(x){ return document.getElementById(x); }

if (navigator.standalone) document.getElementsByTagName('body')[0].className = 'standalone';


function distance(lat1,lon1,lat2,lon2) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2-lat1);  // deg2rad below
  var dLon = deg2rad(lon2-lon1); 
  var a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ; 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  var d = R * c; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI/180)
}

var Player = {

   current: {},

   clear: function(){
      if (Player.current.sound){
         Player.current.sound.stop();
         Player.current.sound.unload();
      }
      if (Player.current.indicator) {
         Player.current.indicator.innerHTML = "&#9654;";
      }
      Player.current = {};
   },

   stream: function(method, track, indicator, options){
      if (Player.current.track) Player.clear();
      Player.current.track = track;
      Player.current.indicator = indicator;
      SC.stream(track, function(sound){
          if (!sound || !sound[method]) { console.log(sound); return; }
          Player.current.sound = sound;
          if (indicator){
             indicator.innerHTML = "&#9654;";
             options.onplay=function(){ indicator.innerHTML = "&#10074;&#10074"; };
             options.onpause=function(){ indicator.innerHTML = "&#9654;"; };
             options.onresume=function(){ indicator.innerHTML = "i&#10074;&#10074;"; };
          }
          sound[method](options || {});
      });
   }

};

function reflip(){
   if (!Player.current.sound || !sorted_actions) return;
   if (!Player.current.sound.position) return;
   var s = Player.current.sound.position / 1000;
   var last_flipped;
   for (var i = 0; i < sorted_actions.length; i++) {
      var a = sorted_actions[i];
      if (Math.abs(a.t - s) < 5) {
         $(a.id).className = "show";
         last_flipped = i;
      } else {
         $(a.id).className = "hide";
      }
   }
   var next;
   if (last_flipped !== undefined) {
      next = sorted_actions[last_flipped+1];
      if (next === undefined){
         next_flip_time = s+10000;
      } else {
         next_flip_time = next.t - 5;
      }
   }
   return last_flipped;
}


Fireball(F, {
   map:{
      '#experience'  : '/pairings/$experience',
      '#experiences...' : '/pairings',
      '#actions...'     : '/p2/actions/$experience',
      '#comments...'    : '/comments/$experience',

      "#results...": function(paint) {
         if (!Fireball.changed('searchq')) return;
	      if (!searchq) return paint([]); 
	      SC.get('/tracks', { q: searchq }, function(tracks) {
            paint(tracks);
	      });
      }
   },

   on_update:{
      '#actions...': function(v){
         var actions = [];
         for (var k in v){ v[k].id = k; actions.push(v[k]); }
         sorted_actions = actions.sort(function(a,b){ return a.t - b.t; });
         next_flip_time = null;
         reflip();
      },

      '#experience': function(v){
         searchq = null; 

         if (!v || !v.saved) $('experience').className = 'editing';
         else $('experience').className = 'playing';

         if (!v){
            $('playhead').style.left = 0;
            return Fireball.refresh();
         }
         
         if (v.duration){
            // $('timeline').style.height = (v.duration * 8) + "px";
            // $('waveform').style.webkitTransform = "rotate(90deg) scale("+(v.duration * 8 / 1800)+",1.15)";
         }
               
         if (!v.soundcloud_url) return Fireball.refresh();


         $('play').innerHTML = "&#8230;";
         Player.stream('load', v.soundcloud_url, $('play'), {
            whileplaying: function(){
                 var s = Player.current.sound.position / 1000;
                 var percent = Player.current.sound.position / Player.current.sound.duration;
                 var px = percent * 320;
                 $('playhead').style.left = (px) + "px";

                 if (sorted_actions && (!next_flip_time || s >= next_flip_time)){
                    if (next_flip_time) beep();
                    var last_flipped = reflip();
                 }

                 //var actions = Fireball.latest('#actions');
                 //for (var k in actions){
                 //   if (Math.abs(actions[k].t - s) > 5) $(k).style.backgroundColor = "black";
                 //   else $(k).style.backgroundColor = "white";
                 //}
            }
        });
	},

	'#experiences': function(v){
		 if (!v) {
			$("count_string").innerHTML = "No experiences yet"
		 } else {
			 $("count_string").innerHTML = Object.keys(v).length + " experiences";
		 }
	}
   },
   
   init:function(){
      SC.initialize({client_id: "43963acff2ef28ec55f039eddcea8478"});
      var m = location.href.match(/experience\/(.*)$/);
      if (m) Fireball.set('$experience', m[1]);
   },

   on_submit:{
      'form': function(){}
   },
   
   on_change:{
      '#quality': function(q){
         Fireball('#experience').update({quality: q.value});
      },
      '#placename': function(pn){
         Fireball('#experience').update({placename: pn.value});
      },

      '#add_sugg': function(input){
         var actions = Fireball.latest('#actions...');
         Fireball('#actions').push({
            t: Player.current.sound.position / 1000,
            type: "Instruction",
            text: input.value
         });
         var count = Object.keys(actions).length;
         Fireball('#experience').update({ 'notice_count': count + 1 });
         input.value = '';
         input.blur();
      },

      //   properties.author_name = form.author_name.value;
      //   properties.to_name = form.to_name.value;
      '#search input': function(q){ searchq = q.value; }
   },
   

   calculated_fields:{

      "#experiences expnotices": function(exp){
         if (exp.notice_count) return "has " + exp.notice_count + " hidden notices";
         else return "";
      },
      "#experience googlemap": function(exp){
         if (!exp.start_loc) return "<a href='#' id='geolocate'>Geolocate!</a>";
         var mapUrl = "http://maps.google.com/maps/api/staticmap?markers=";
         mapUrl = mapUrl + exp.start_loc[0] + ',' + exp.start_loc[1];
         mapUrl = mapUrl + '&zoom=16&size=320x100&maptype=roadmap&sensor=true&key=AIzaSyA51bUQ2qrcA4OqxkBVktwFkxH9XEqcG3A';
         return "<img src='"+mapUrl+"'>";
      },

      "#experience expstyle": function(exp){
         if (!exp.start_loc) return "";
         var mapUrl = "http://maps.google.com/maps/api/staticmap?markers=";
         mapUrl = mapUrl + exp.start_loc[0] + ',' + exp.start_loc[1];
         mapUrl = mapUrl + '&zoom=16&size=320x200&maptype=roadmap&sensor=true&key=AIzaSyA51bUQ2qrcA4OqxkBVktwFkxH9XEqcG3A';
         return "background-image: url(" + mapUrl + ");";
      },

      "#experiences expstyle": function(exp){
         if (!exp.start_loc) return "";
         var mapUrl = "http://maps.google.com/maps/api/staticmap?markers=";
         mapUrl = mapUrl + exp.start_loc[0] + ',' + exp.start_loc[1];
         mapUrl = mapUrl + '&zoom=16&size=320x200&maptype=roadmap&sensor=true&key=AIzaSyA51bUQ2qrcA4OqxkBVktwFkxH9XEqcG3A';
         return "background-image: url(" + mapUrl + ");";
      },

      "#experiences expdist": function(exp){
         if (!curloc) return "";
         var km = distance(exp.start_loc[0], exp.start_loc[1], curloc[0], curloc[1]);
         if (km < 1){
            return "close enough to play!"
         } else {
            return km + " km away...";
         }
      },
      
      "#experiences calctitle": function(exp){
         // TODO: make from start loc name and song name and authors

      	if (exp.quality){
      		var msg = "An <b>#" + exp.quality + "</b> experience, set to <b>&ldquo;" + exp.song_title + "&rdquo;</b>. ";
      		if (exp.to_name) msg += "with <b>" + exp.to_name + "</b> in mind.  ";
      		if (exp.placename) msg+= "<br>starts <b>" + exp.placename + "</b>";
      		if (exp.author_name) msg += ", by <b>" + (exp.author_name) + "</b>.  ";
            else msg += ".";
      		return msg;
      	}

         if (exp.to_name){
	         return "With <b>" + exp.to_name + "</b> in mind, <b>" + (exp.author_name || "Someone") + "</b>, came up with a way of enjoying &ldquo;" + exp.song_title + "&rdquo; starting at &ldquo;" + exp.placename + "&rdquo;";
         } else {
	         return "<b>" + (exp.author_name || "Someone") + "</b> has a way of enjoying &ldquo;" + exp.song_title + "&rdquo; starting at &ldquo;" + exp.placename + "&rdquo;";
         }
      },

      '#actions waveform_url': function(action){
         var l = Fireball.latest('#experience'); 
         return l && l.waveform_url;
      },

      '#actions style': function(action){
         var l = Fireball.latest('#experience'); 
         return "background-image: url(" + l.waveform_url + ")";
         // return "top: " + (action.t * 8 + 5) + "px";
      },

      '#actions barstyle': function(action){
         var l = Fireball.latest('#experience'); 
         var percent = action.t / l.duration;
         return "left:" + percent*320;
        // return "top: " + (action.t * 8 + 5) + "px"; 
      }
   },
   
   show_when:{
      '#pick_song': function(){ return show_pick_song; },
      '#get_distance': function(){ return !curloc; },
      '#city': function(){ return !Fireball.get('$experience'); },
      '#experience': function(){ return Fireball.get('$experience'); },

      '.saved': function(){
         var latest = Fireball.latest('#experience');
         return latest && latest.saved; 
      },
      '.notsaved': function(){
         var latest = Fireball.latest('#experience');
         return latest && !latest.saved; 
      },
      '.hassong': function(){
         var latest = Fireball.latest('#experience');
         return latest && latest.song_title; 
      },
      '.nosong': function(){
         var latest = Fireball.latest('#experience');
         return latest && !latest.song_title; 
      }
   },

   on_click: {
   	"#results a .choose_song": function(b){
   		var data = b.parentNode.parentNode.data;
         show_pick_song = false;
         navigator.geolocation.getCurrentPosition(function(pos){
            curloc = [ pos.coords.latitude, pos.coords.longitude ];
            var id = Fireball('#experiences').push({
               'start_loc': curloc,
               soundcloud_url: "/tracks/" + data.id,
               soundcloud_id: data.id,
               waveform_url: data.waveform_url,
               song_title: data.title,
               duration: data.duration / 1000
            }).name();
            Player.clear();
            Fireball.set('$experience', id);
         });
   	},

   	"#results a": function(a){
   		var data = a.data;
         Player.stream('play', '/tracks/' + data.id);
   	},


      "#share": function(){
         var url = "http://experiencefarm.org/#!experience/" + Fireball.get('$experience');
         url = encodeURIComponent(url);
         window.location = "mailto:?subject=I%20made%20you%20a%20thing&body="+url;
      },
      "#add_comment": function(){
         var comment = prompt('comment:');
         if (!comment) return;
         Fireball('#comments').push({ text: comment });
      },
      "#experiences li": function(el){
         beep();
         Fireball.set('$experience', el.id);
      },

      '#get_distance': function(){
         navigator.geolocation.getCurrentPosition(function(pos){
            curloc = [ pos.coords.latitude, pos.coords.longitude ];
            Fireball.refresh('#experiences...');
         });
      },

      '#new_experience': function(){
         show_pick_song = true;
      },

      "#browse": function(){ Fireball.set('$experience', null);  },
      
      '#actions>a': function(el){
         var latest = Fireball.latest('#experience');
         if (latest && latest.saved) return;
         var sure = confirm("Do you want to delete this instruction?");
	      if (!sure) return;
         var actions = Fireball.latest('#actions...');
         Fireball('#actions').child(el.id).remove();
         var count = Object.keys(actions).length;
         Fireball('#experience').update({ 'notice_count': count - 1 });
      },
	  		   
      '#geolocate':function(){
         var latest = Fireball.latest('#experience');
         if (latest && latest.saved) return;
         navigator.geolocation.getCurrentPosition(function(pos){
            Fireball('#experience').update({ 'start_loc': [
               pos.coords.latitude, pos.coords.longitude
            ]});
         });
	   },
      "#edit":function(){
         Fireball('#experience').update({ saved: false });
      },
      "#save":function(){
         Fireball('#experience').update({ saved: true });
      },
	   
      "#delete":function(){
         Fireball('#experience').remove();
         Fireball.set("$experience", null);
      },
      ".rewind": function(){
         if (Player.current.sound) Player.current.sound.setPosition(0);
         $('playhead').style.left=0;
         reflip();
      },
      "#play": function(){
         if (Player.current.sound) return Player.current.sound.togglePause();
         else return alert('No current sound');
      }
	}
	
});

var beep = (function () {
   var ctx = new(window.audioContext || window.webkitAudioContext);
   return function (duration, type, finishedCallback) {
      if (!duration) duration = 60;
      if (!type) type = 0;
      duration = +duration;
      type = (type % 5) || 0;  // Only 0-4 are valid types.
      if (typeof finishedCallback != "function") {
         finishedCallback = function () {};
      }

      var osc = ctx.createOscillator();
      //var reverb = ctx.createConvolver();
      var gain = ctx.createGainNode();
      gain.gain.value = 0.17;
      osc.type = type;
      osc.frequency.value = 880*1.5;
      osc.connect(gain);
      //osc.connect(reverb);
      //reverb.connect(gain);
      gain.connect(ctx.destination);

      osc.noteOn(0);
      setTimeout(function () { osc.noteOff(0); finishedCallback(); }, duration);
   };
})();

