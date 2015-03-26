angular.module('app')
.factory('PollSrv', function(ParseUtils, UserSrv, $firebaseArray, Config, $q){


	var pollCrud = ParseUtils.createCrud('Polls');
  var url = Config.firebase.url +'/polls';
  var ref = new Firebase(url);

    /*
    Create poll & return the Poll with firebase link for answers & stats
    */
	function setPollsData(poll, user){
    var deferred = $q.defer();
    return pollCrud.save({
        question: poll.question,
        singleChoise : poll.singleChoise,
        choices : poll.choices,
        location : user.location,
        user: ParseUtils.toPointer('_User', user)
      }).then(function(poll){
        var answersPath = getAnswersPath(poll.objectId);
        var statsPath = getStatsPath(poll.objectId);
        var answersStats;
        $firebaseArray(answersPath).$loaded().then(function(result){
          answers = result;
          $firebaseArray(statsPath).$loaded().then(function(stats){
            answersStats = stats;
            var toReturn = angular.extend({
              answers : answers,
              answersStats: answersStats,
              pollid : poll.objectId
            }, poll);
            deferred.resolve(toReturn);
          });
        });
        return deferred.promise;
      });
    }
  /*
  Return Polls without firebase reference
   */
    function getPollsAround(lastDate){
      if(lastDate === undefined){
        var matchMaxAge = 60 * 60 * 1000; // 1h
        var gt = ParseUtils.toDate(Date.now() - matchMaxAge);
      }else{
        var gt = ParseUtils.toDate(lastDate);
      }

      var matchDistance = 0.1; // 100m


      return UserSrv.getCurrent().then(function(user){
    	  return pollCrud.find({
	          updatedAt: {
              $gt: gt
            },
	          location: {
	            $nearSphere: ParseUtils.toGeoPoint(user.location.latitude, user.location.longitude),
	            $maxDistanceInKilometers: matchDistance
	          }
	        }).then(function(polls){
            return polls;
	        });

    	})
    }
/*
Return Answers & Stats (firebase ref) for an array of polls
 */
    function getAnwsersForPolls(polls, user){
      var deferred = $q.defer();
      var promises = [];
      var pollsToReturn = [];

      _.map(polls, function(poll){
        //Maybe we need a Poll Model in order to be sure to have the right informations every time
        //and to have a cleaner code?
        promises.push(getAnswers(poll, user).then(function(result){
          pollsToReturn.push(angular.extend(poll,result));
        }));
      });
      //Wait for it... for then!
      $q.all(promises).then(function(){
        deferred.resolve(pollsToReturn);
      });
      return deferred.promise;
    }

    function getAnswers(poll, user){
      var answers;
      var answersPath = getAnswersPath(poll.objectId);
      var statsPath = getStatsPath(poll.objectId);
      var defer = $q.defer();

      var answersStats = null;
      $firebaseArray(answersPath).$loaded().then(function(result){
        answers = result;
        $firebaseArray(statsPath).$loaded().then(function(stats){
          answersStats = stats;
          var alreadyVoted = hasUserAlreadyVoted(answers, user);
          var toReturn = angular.extend({
            answers : answers,
            answersStats: answersStats,
            pollid : poll.objectId,
            alreadyVoted : alreadyVoted
          }, poll);
          defer.resolve(toReturn);
        });
      });
      return defer.promise;
    }



    /*
    Save an answer for a poll
     */
    function saveAnswer(poll, choices, user){

      var statsPath = getStatsPath(poll.objectId);
      var deferred = $q.defer();
      _.map(choices, function(choice){
        poll.answers.$add({
          choice : choice.id,
          user : user.objectId
        });
        //increment values
        var statsChoice = statsPath.child(choice.id);
        statsChoice.transaction(function(current_val){
          if(!current_val){
            current_val = 0;
          }
          current_val++;
          return current_val;
        }, function(){
          var totalVotes = statsPath.child('totalVotes');
          totalVotes.transaction(function(current_val){
            if(!current_val){
              current_val = 0;
            }
            current_val++;
            return current_val;
          }, function(){
            poll.pollid = poll.objectId;
            poll.alreadyVoted = true;
            deferred.resolve(poll);
          });
        });
      });
      return deferred.promise;
}
/*
maybe use some or every. The use of break can be good for a performance point of view...
 */
    function hasUserAlreadyVoted(answers, user){
      var isFound = false;
      _.map(answers, function(answer){
        if(answer.user == user.objectId){
          isFound = true;
        }
      });
      return isFound;
    }

    function getRootPath(pollid){
      return ref.child(pollid);
    }

    function getAnswersPath(pollid){
      return getRootPath(pollid).child('answers');
    }

    function getStatsPath(pollid){
      return getRootPath(pollid).child('stats');
    }

    function getPollsByUser(user){
      return pollCrud. find(
        {
          user: ParseUtils.toPointer('_User', user)
        }, '&order=-createdAt'
      ).then(function(polls){
        return polls;
      });
    }

    function getPollById(pollId){
      return pollCrud.find(
        {
          objectId : pollId
        }
      ).then(function(poll){
          return poll[0]
        });
    }

    function remove(poll){
      return UserSrv.getCurrent().then(function(user){
        if(poll.user.objectId === user.objectId){
          return pollCrud.remove(poll).then(function(result){
            return result;
          });
        }else{
          return false;
        }

      });


    }

    function getIndexBy$Id(poll, choiceId){
      return  _.findIndex(poll.answersStats,function(chr){ return chr.$id == choiceId;});
    }

    function getValue(array, index){
      if(index < 0){
        return 0;
      }
      return array[index].$value;
    }

    function getPercent (poll, choiceid){
      var nbVotes = getValue(poll.answersStats,getIndexBy$Id(poll, choiceid));
      var totalVotes = getValue(poll.answersStats,getIndexBy$Id(poll, 'totalVotes'));
      return parseInt( (nbVotes / totalVotes) * 100);
    }

  return {
  	setPollsData : setPollsData,
  	getPollsAround : getPollsAround,
    saveAnswer : saveAnswer,
    getAnswers : getAnswers,
    hasUserAlreadyVoted : hasUserAlreadyVoted,
    getAnwsersForPolls : getAnwsersForPolls,
    getPollsByUser : getPollsByUser,
    getPollById : getPollById,
    getIndexBy$Id : getIndexBy$Id,
    getValue : getValue,
    getPercent : getPercent,
    remove : remove
  };


});
