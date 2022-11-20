/* ㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡ */
// 전역변수 로드 시작
var sam_main = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("삼국지"); // 게임화면
var sam_inf = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("sam_계기판"); // 계기판 (현재회차id, 게임 플레이 진행여부(T/F))
var sam_roundlog = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("sam_roundlog"); // 회차기록 (회차, 시작시간, 종료시간)
var sam_icon = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("sam_icon"); // 아이콘 DB
var sam_scream = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("sam_scream");  // 단말마
var sam_player = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("sam_player"); // 게임화면
var sam_land = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("sam_land"); // 땅정보 (idx(1~70쯤), 땅이름, 주인이름, 인접지역(최대8개))
var sam_log = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("sam_log");  // 게임 로그 (회차, 시각, 문구txt)
var sam_record = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("sam_record"); // 전투기록
var sam_currRound = sam_inf.getRange(3, 1).getValue(); // 현재 라운드

var cell_currRound = sam_main.getRange("M12"); // 현재 라운드
var cell_lastTurn = sam_main.getRange("M14"); // 현재 턴
var cell_server = sam_main.getRange("M16"); // 현재 서버 셀
var cell_recentTime = sam_main.getRange("Z12"); // 최근 게임진행된 시각
var cell_nextTime = sam_main.getRange("Z14"); // 다음 게임진행할 시각

var sam_routineTime = 30; // 한 루틴에 걸리는 분수
var sam_nextGameStartHour = 9; // 다음 게임이 시작하는 시각
var sam_totalPlayers = 20; // 총 수용가능 인원수
var vipPercent = 10; // 공부 열심히 한 회원 한턴 더줄 확률

// 전역변수 로드 끝

/* ㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡ */
// 기본 메커니즘부 시작

// targetDb 의 전체 내용을 비우고 inputValues 배열 내용만으로 다시 채워쓰는것.
// 이때 targetDb는 3행부터 지워짐. 1/2열은 데이터 헤더용 행이기 때문에 건드리면 안됨.
// inputValues는 반드시 2차원 배열로 받아야함. 여러행 한번에 쓰는거기때문. 혹 1차원행렬 넣을거면 대괄호 하나 더감싸서 보내라.
function data_rewrite (targetDb, inputValues) {
 targetDb.getRange(3, 1, (targetDb.getLastRow()>=3?targetDb.getLastRow()-2:1), targetDb.getLastColumn()).clear(); // 3행부터 끝행까지 올 클리어
 targetDb.getRange(3, 1, inputValues.length, inputValues[0].length).setValues(inputValues); // 3행부터 inputValues의 끝행까지 셀에 내용 좍 쓰기
}

// 땅 변동이력 로그: 맵별 땅주인 리스트 읽어서 전투로그에 땅변동이력 남겨놈
function saveBattleLog() {
  var lands = sam_land.getRange(3, 1, sam_land.getLastRow()-2, sam_land.getLastColumn()).getValues();
  var writeList = new Array();
  for (var i in lands) {
    writeList[i] = new Array();
    writeList[i][0] = lands[i][3];
  }
  writeList.unshift([new Date()]);
  writeList.unshift([new Date()]);
  writeList.unshift([cell_currRound.getValue()]);
  sam_record.insertColumnBefore(3).getRange(1, 3, writeList.length, 1).setValues(writeList);
}

// 빽섭: 랜드를 주어진 스텝만큼 뒤로 돌려줌
function sam_backsub(step) {
  // step은 battlelog 시트에서의 백업된 랜드데이터 번호, 즉 뒤로 돌릴, DB에 적용할, 특정 백업번호를 의미.
  // 시트 내 랜드데이터 열은 3열부터 시작하니까, step을 1로 입력받으면 데이터 검색은 3열부터 해야하고, 따라서 실제 db내 검색값은 step + 2 필요. 
  var importedData = sam_record.getRange(4, step + 2, sam_record.getLastRow() - 3, 1).getValues();
  // 추출한 데이터 land에 적용
  sam_land.getRange(3, 4, sam_land.getLastRow() - 2, 1).setValues(importedData);
}

// sam_log DB에 로그 추가함
//
// 입력 가능한 패턴
// 플레이어 idx 있을때 입력배열 : [logtxt, currTurn, plNum]
// 플레이어 idx 없을때 입력배열: [logtxt, currTurn] → 그외 다른 입력배열도 동일함.
// 그외 간헐적 입력배열: logtxt
//
// 출력 목표 배열: [현재시각, 현재라운드, 현재턴, 플레이어넘버, 텍스트]
function writeLog(txt) {
  var currRound = cell_currRound.getValue();
  if (typeof txt == 'object' && txt.length >= 2) { // 배열형태로 입력받았을 때
    var texts = [];
    for(var i in txt) if (txt[i].length == 3) texts.push([new Date(), currRound, txt[i][1], txt[i][2], txt[i][0]]); // idx 입력받았으면 idx
    else texts.push([new Date(), currRound, txt[i][1], -1, txt[i][0]]); // idx 입력 못받았으면 디폴트 -1
    sam_log.getRange(sam_log.getLastRow()+1, 1, texts.length, 5).setValues(texts);
  } else { // 한 개의 메세지를 입력받았을 때 (string 하나만 달랑 입력받았을 때)
    var currTurn = -1, plNum = -1;
    var inputMsg = [[new Date(), currRound, currTurn, plNum, txt]];
    sam_log.getRange(sam_log.getLastRow()+1, 1, 1, 5).setValues(inputMsg);
  }
}

// sam_main 계기판에 현재 상태를 표시
function setMainStatus(stat) {
  switch (stat) {
    case 'loading' : cell_server.setValue("LOADING").setFontColor("#e69138"); break;
    case 'idle' : default : cell_server.setValue("IDLE").setFontColor("#d9d9d9"); break;
  }
}

// 입력한 퍼센트의 확률로 true를 반환함
function rndPercent(percentage) {
  var rndPerc = (Math.random()*100);
  //writeLog(Math.floor(rndPerc)+"%");
  return (rndPerc <= percentage) ? true : false;
}

// 기본 메커니즘부 끝
/* ㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡ */
// 기타펑션부: 맵을 새로 갱신하는 함수 외 

// 특정 플레이어 이름으로 땅 개수를 구해줌
function getLandSize(plName, land) {
  var landWidth = 0; // 처음 랜드값은 0
  for (i in land) if (land[i][3]==plName) landWidth++; // 랜드가 검색될수록 랜드값 +1
  return landWidth; // 최종 랜드값 리턴
}

// 시트로부터 각 스터디원의 '이름', '전날 공부량 마크'를 추출하고, 이에 따라 VIP값을 바꿈
// 일일 1회 실행 트리거로 돌리는 함수기 때문에, on/off/done/haven't done 이런 트리거 스위치를 따로 체크하지 않아도 된다.
// 몇 시에 실행할지는 아직 모르겠다.
function sam_vipRefresh() {

  // 기본 변수 준비
  var player = sam_player.getRange(3, 1, sam_player.getLastRow()-2, sam_player.getLastColumn()).getValues();
  var land = sam_land.getRange(3, 1, sam_land.getLastRow()-2, sam_land.getLastColumn()).getValues();
  var logtxt = [];
  var currTurn = cell_lastTurn.getValue();
  
  // 시트에서 데이터 읽어옴
  //sheetCleaning(); // 시트청소💟 
  var sheeters = sh_study.getRange(8, 3, 30, 2).getValues(); // 시트내의 전날 기록을 읽어옴. [공부마크, 이름] 순
  var vipList = [];
  
  for(var i in sheeters) {
    // 기본 변수 준비
    var name = sheeters[i][1];
    var studied = sheeters[i][0];
    
    // 축복주기
    for(var j in player) if(player[j][2] == name && getPower(player[j][2], land) > 0 && (studied == "🔥" || studied == "📖" || studied == "·")) { // 플레이어별로 점검하여, j번재 플레이어가 해당 네임에 맞고, 공부마크가 있을 경우에만 축복 시행
      if(studied == "🔥") player[j][3] = 3;
      else if(studied == "📖") player[j][3] = 2;
      else if(studied == "·") player[j][3] = 1;
      vipList.push(player[j][2]);
    }
    
  }
  
  // 후처리  
  if (vipList.length > 0) {
    // 다시 새로 만들어진 players 배열을 DB에 반영
    data_rewrite(sam_player, player);
    logtxt.push([vipList.join(', ') + "...!", currTurn]);
    logtxt.push(["어제 병법서를 열심히 읽은 스터디원은 오늘 아침 햇살을 맞이하는 눈빛이 사뭇 다릅니다.", currTurn]);
    logtxt.push(["그 어깨에서는 무언가 무서운 모양의 연기가 솟아오르고 있습니다...", currTurn]);
  } else {
    logtxt.push(["스터디원들은 어제 아무도 공부를 열심히 하지 않았습니다. 무료한 전쟁이 계속됩니다...", currTurn]);
  }
  
  // 로그가 있으면 출력
  if(logtxt.length > 0) writeLog(logtxt);
}

// 해당 플레이어의 행동력을 구함
function getPower(plName, land) {
  var landSize = getLandSize(plName, land);
  if(landSize >= 1 && landSize < 4) return 1;
  else if(landSize >= 4 && landSize < 9) return 2;
  else if(landSize >= 9 && landSize < 18) return 3;
  else if(landSize >= 18 && landSize < 31) return 4;
  else if(landSize >= 31) return 5;
  else return 0;
}

// 기타펑션부 끝
/* ㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡ */
// 메인실행부 BEAT부

// pl를 입력하면 땅따먹기 판단 1회 하여, 로그 기록하고 DB에 반영함.
function beat(pl, land, currTurn) {

  // plName는 beat부를 처리할 플레이어 이름이다.
  // 전체 땅목록 land는 상위함수에서 넘어온 상태다.
  var plName = pl[2];
  var logtxt = [];
  
  // 먼저 땅 사이즈를 검사. 없으면 return
  var landMany = getLandSize(plName, land);
  if (landMany == 0) { /*debugLog("땅사이즈 0이라 리턴합니다.");*/ return [land, []]; }
  //debugLog(plName +" 땅사이즈 통과, beat 시작");

  // 해당 플레이어의 인접지역 리스트를 neighbor 변수로 뽑아옴
  var neighbor = ""; // 인접지역 리스트를 문자열 형태로 뽑기위한 준비.
  for (var i in land) { // land 행 중에서
    if (land[i][3] == plName) { // 주인이 현재 플레이어인 행에 대해
      neighbor += ","; // (변수 붙이기니까 , 를 넣어줌)
      neighbor += land[i][4]; // 그 인접땅 리스트를 뽑아 neighbor 변수 끝에 추가해줌
    }
  }
  neighbor = neighbor.substring(1);  // 인접지역이 한개이상 뽑혔다면 맨 왼쪽에 , 붙어있을테니 빼줌.
  neighbor = neighbor.split(",");  //log_add(pl + "님의 중복 이웃목록:"+neighbor);
  //log_add(plName + "님의 중복 제거된 이웃목록:"+neighbor);
  // 인접지역 리스트를 검사해서 자기땅 아닌곳의 idx 목록을 추출
  var newLandList = []; // 자기땅 아닌곳의 목록
  for (var j in neighbor) { // neighbor의 각 넘버에 대하여
    var compare = land[neighbor[j]]; // neighbor의 한 행을 compare 배열로 잡고
    if (compare[3] != plName) { // 그 배열의 주인이 현재 플레이어가 아닐 때
      newLandList.push(compare[0]); // 해당 행의 "idx"를 newLand 리스트에 추가
    }
  }
  // log_add("공격 후보지:" + newLandList);
  if(newLandList.length == 0) { // 그러한 땅이 없으면 리턴합니다.
    return [land, []];
  }
  //debugLog("이웃땅 조사됨");

  // 위에서 구한 자기땅 아닌 idx 목록 (newLandList) 중 랜덤으로 한곳 선정
  var randomNewNum = newLandList[Math.floor(Math.random() * newLandList.length)]; // 자기땅 아닌 idx 중 랜덤하게 하나 찝어서(=newLand[랜덤])
  var newLand = land[randomNewNum]; // 그 idx의 랜드를 정착할 새로운 랜드로 결정함.
  // newLand array는 선정된 땅의 땅정보를 갖게 된다. [땅idx(0 ~ 93), 지역구분, 땅이름, 주인이름, 인접지역리스트(string)]
  // log_add("공격할 지역:" + newLand[3]);
  //debugLog("랜덤 이웃idx선정완료");

  // 상기 한곳의 랜덤땅의 주인이름을 회원이름으로 변경
  var victimMan = newLand[3];
  if (newLand[3].toString().length > 0) logtxt.push(["<"+plName+">님이 <" + victimMan + ">님의 [" + newLand[2] + "] 지역을 뺏었습니다.", currTurn, pl[0]]);
  else logtxt.push(["<"+plName+">님이 비어 있는 [" + newLand[2] + "] 지역을 개척했습니다.", currTurn, pl[0]]);
  //debugLog("땅주인 변경로그 작성함");
  //debugLog("newLand = [" + newLand[0] + ", " + newLand[1] + ", " + newLand[2] + ", " + newLand[3] + ", (" + newLand[4] + ") ]");
  land[newLand[0]][3] = plName+"";  // Data변경내용 랜드변수에 반영

  // 땅이 없을 때 땅 뺏긴 플레이어가 단말마를 지름
  if (victimMan.toString().length > 0) { // 땅이름 길이가 1 이상이면 (즉 주인 이름이 있던 땅이면)
    if (getLandSize(victimMan, land) == 0) { // 희생양의 땅개수가 0이면
      var screamData = sam_scream.getRange(3, 1, sam_scream.getLastRow()-2, sam_scream.getLastColumn()).getValues();
      var scream = screamData[Math.floor(Math.random() * screamData.length)][1]; // 랜덤한 스크림 하나를 불러옴
      // var scream = screamData[screamData.length-1]; // 디버그용
      logtxt.push(["<"+plName+">님으로 인해 <"+victimMan+">님의 나라가 멸망하였습니다.", currTurn, pl[0]]);
      if(scream.indexOf("$") > 0) { // $가 들어간 대화는 둘로 쪼개 두줄로 표시하며, 두번째 줄은 pl가 나옴
        scream = scream.split("$");
        logtxt.push(["<"+victimMan+">님의 마지막 한 마디: " + scream[0], currTurn, pl[0]]);
        logtxt.push(["<"+plName+"> "+scream[1], currTurn, pl[0]]);
      } else {
        logtxt.push(["<"+victimMan+">님의 마지막 한 마디: "+ scream, currTurn, pl[0]]);
      }
    }
  }
  //debugLog("단말마 로그 작성");

  return [land, logtxt];
}

// VIP beat
function beats_VIP(player, land, currTurn) { // VIP 플레이어별로 beat 실행 - log는 beat 함수 내에서 알아서 남겨줌
  var logtxt = [];
  var chkvip = 0;
  for(var i in player) if(player[i][3] >= 1 && player[i][3] <= 3) chkvip++;
  if(chkvip > 0) {
    logtxt.push(["공부를 열심히 한 스터디원들의 진격이 시작됐습니다!", currTurn]);
    player.sort(function(){ return Math.random() - Math.random(); }); // 플레이어 전체 배열 랜덤 쏠팅
    for(var j in player) if(player[j][3] >= 1) { // VIP0 이상인 플레이어들에게 vip 횟수만큼 beat 실행시켜줌
      for(var k = 0; k < player[j][3]; k++) {
        var returned = beat(player[j], land, currTurn);
        land = returned[0];
        logtxt = logtxt.concat(returned[1]);
      }
    }
  }
  return [land, logtxt];
}

// 일반 beat
function beats_NORMAL(player, land, currTurn) { // 모든 플레이어 beat 실행 - log는 beat 함수 내에서 알아서 남겨줌
  var logtxt = [];
  logtxt.push([currTurn + "년이 되었습니다. 모든 스터디원들이 진격을 개시합니다!", currTurn]);
  player.sort(function(){ return Math.random() - Math.random(); }); // 플레이어 전체 배열 랜덤 쏠팅
  for(var t in player) {
    var pl = player[t]; // 플레이어 정보뽑아옴
    var time = getPower(pl[2], land); // 공격횟수 계산
    for(var u = 0; u < time; u++) {
      var returned = beat(pl, land, currTurn); // 기본행동 (최소 1회 ~ 최대 10회)
      land = returned[0];
      logtxt = logtxt.concat(returned[1]);
    }
  }
  return [land, logtxt];
}

// 메인실행부 BEAT부 끝
/* ㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡ */
// 게임 끝내기 / 게임 초기화 및 시작

// 게임이 끝났을 경우 실행시키는 루틴
function game_finish() {
  var logtxt = [];
  
  // 계기판 DB 변수(게임변수) 내용변경
  // 여기서는 게임 종료라고만 기록해 놓는다.
  cell_lastTurn.setValue("게임 종료"); // "TURN(현재 턴)" ⇒ "게임 종료"
  
  // 회차로그 가장 최신줄(새줄 X)에 게임 종료시각 기록
  sam_roundlog.getRange(sam_roundlog.getLastRow(), 3).setValue(new Date());
  
  // 플레이어의 이름 겟
  var winnerName = sam_main.getRange("G79").getValue();

  // 화면 상단 중앙부에 왕좌 그림 표시
  sam_inf.getRange(40, 3, 40, 47).copyTo(sam_main.getRange(21, 32));

  // 메인화면 계기판 내 다음시간 표시
  var nextGameStartTime = new Date(new Date().getTime() + 1000*60*60*24); //24시간후
  var convertedDate = Utilities.formatDate(new Date(nextGameStartTime), 'GMT+9', 'MM/dd HH:mm:ss'); // x시간후 - 포맷만 다르고 엑셀입력하면 값은 똑같음 (현재60분일걸)
  cell_nextTime.setValue(convertedDate);

// 다됐으면 로그에 기록
  var currTurn = cell_lastTurn.getValue(); // 게임 턴 변수 (종료:게임 종료됨 / 그외 숫자: 게임중)
  logtxt.push(["축하합니다. <" + winnerName + ">님이 모든 땅을 정복하였습니다!"]);
  logtxt.push(["합격의 기대감에 가득차 있는 " + winnerName + ". \"드디어 모두와 싸워 이기고 중원을 통일했다." + currTurn+ "년 간의 장수생 생활도 이제 끝이야!\""]);
  logtxt.push(["갑자기 하늘에서 애국가가 흘러나오며 전에 들었던 저렁쩌렁한 목소리가 울려퍼집니다. \"실험이 끝났다.\""]);
  logtxt.push(["\"노량진의 장수생 중 가장 강한 건 너인 것 같군.\""]);
  logtxt.push(["소리를 듣고 두리번거리던 중, " + winnerName + "이 무기로 갖고 있던 필기노트를 뺏겼습니다. \"앗..!\""]);
  logtxt.push(["당황하는 찰나, 그의 뒷통수에 큰 충격이 느껴집니다. \"쾅!!\""]);
  logtxt.push(["\"아앗..!\" 머리가 심하게 흔들거리며, 그는 땅에 쓰러져 기절했습니다."]);
  logtxt.push(["고개를 황급히 돌린 그가 마지막으로 본 것은, 자신의 필기노트를 쥔 어떤 흰 가운의 사내였습니다. \"안돼..\""]);
  logtxt.push(["의식이 희미해지던 " + winnerName + "의 귀로 나지막한 혼잣말이 들려옵니다. \"이걸로는.. 이걸로는 부족하다.\""]);
  logtxt.push(["\"더.. 많은 공부자료가 필요하다..\""]);
  logtxt.push(["<새 게임은 약 24시간 이후인 " + convertedDate + " 에 시작됩니다.>"]);
  writeLog(logtxt);
  
  // 계기판 변경
  cell_lastTurn.setValue("종료");
  
  // 서버 = 휴식
  setMainStatus("idle"); 
}

// 새 라운드 시작을 위한 초기화: 플레이어 정보, 맵 정보 리셋
function newgame_start() {
  var logtxt = [];

  // DB 회원 최신시트에서 회원정보 뽑아옴
  sheetCleaning(); // 플레이어 데이터를 읽기 전에 시트 양식을 청소
  var userInfo = sh_study.getRange("D8:D37").getValues(); // 회원 기본DB 빼옴 ([이름만 쭉~])
  //writeLog(userInfo);

  // 유저 이름만으로 이루어진 배열을 랜덤 쏠팅한다.
  userInfo.sort(function() { return Math.random() - Math.random(); });
  //writeLog("솔팅완료: " + userInfo);

  // 플레이어란에 새로 올릴 2차원 array 제작
  var player = []; // 플레이어란에 올릴 전체 2차원 변수
  var idx = 0;
  var iconList = sam_icon.getRange(3, 2, sam_icon.getLastRow()-2, 1).getValues(); // 전체 아이콘 리스트를 불러와 배열로 잡는다.
  for(var i = 0; i < userInfo.length; i++) {
    var randomIdxNum = Math.floor(Math.random() * iconList.length); // 랜덤번호픽(150개 기준 0 ~ 149)
    var selectedIcon = iconList[randomIdxNum]; // 선택된 아이콘 idx목록[랜덤픽(150개 기준 0 ~ 149)]
    iconList.splice(randomIdxNum, 1); // 사용한 아이콘 idx는 아이콘 리스트에서 파낸다.
    if (userInfo[i] != "(빈자리)" && userInfo[i].length >= 1 && userInfo[i] != "") { // 빈자리가 아니며 동시에 길이가 1 이상일 때에만 플레이어 목록에 추가시킨다.
      player.push([
        idx++,                  // 0: 회원idx
        "불명",                  // 1: 출신대륙인데 일단은 공란으로 해둔다. (땅 부여하면서 작성 가능한 부분임)
        userInfo[i],            // 2: 회원이름
        false,                  // 3: 공부시간 정보 → 처음엔 false로 두고, DB 올린 이후에 따로 계산하기로함.
        selectedIcon            // 4: 아이콘 (DB에서 랜덤추출)
      ]);
    }
  }
  //writeLog("플레이어 배열 준비완료");
  
  // DB 땅 주인이름 초기화
  sam_land.getRange(3, 4, sam_land.getLastRow()-2, 1).clearContent();
  
  // 메인화면에서 왕좌그림 없애서 초기화
  sam_inf.getRange('D83:CY145').copyTo(sam_main.getRange('D4'));
  
  // 플레이어들에게 랜덤한 땅 하나를 부여
  var land = sam_land.getRange(3, 1, sam_land.getLastRow()-2, sam_land.getLastColumn()).getValues();
  for(var j = 0; j < player.length; j++) {
    //var text = playerInfo[i][1];
    var randomNum = Math.floor(Math.random() * land.length); // 0 ~ 49까지의 숫자 중 하나를 뽑는다.
    var randomLand = land[randomNum]; // 자기땅 아닌 idx 중 랜덤하게 하나 찝어서(=landList[0번째 ~ 49번째])
    sam_land.getRange(3 + randomLand[0]*1, 4, 1, 1).setValue(player[j][2]+""); // 랜드DB의 상기 랜덤idx의 행에 플레이어이름을 써넣는다.
    player[j][1] = randomLand[1]; // 부여받은 땅을 출신지로 삼아 기록한다.
    //text += "님은 " + randomLand + "에 떨어졌습니다.";
    land.splice(randomNum, 1); // 사용한 idx는 배열에서 버린다.
  }
  
  // 플레이어DB 내용을 위에서 만든 newInfo Array로 전면교체
  data_rewrite(sam_player, player);
  
  // 플레이어 투하를 완료한 초기 상태의 땅을 배틀로그에 기록
  saveBattleLog();

  // DB 로그 내용 이메일 백업
  //MailApp.sendEmail("saesgalmadoennamnyeoapdwi@gmail.com", nextRound-1+"회차 전투메세지 이력 백업", debugDoubleArrayInfo(data_load(sam_log)));
  
  // 로그DB 및 로그메세지 번호 초기화
  sam_log.getRange(3, 1, sam_log.getLastRow()-2, sam_log.getLastColumn()).clearContent();

  // 계기판 및 DB의 라운드 및 턴 관련변수 변경
  var nextRound = sam_roundlog.getRange(sam_roundlog.getLastRow(), 1).getValue()*1 + 1; // 다음 회차는 roudnlog의 가장 마지막 라운드에 +1한 것
  sam_roundlog.getRange(sam_roundlog.getLastRow()+1, 1, 1, 2).setValues([[nextRound, new Date()]]); // 신규회차 및 신규회차 시작시각을 roundlog에 반영
  cell_currRound.setValue(nextRound); // 메인메뉴의 현재 라운드 = 신규 라운드
  cell_lastTurn.setValue(50); // 메인메뉴의 현재 턴 = 0
  cell_recentTime.setValue(new Date()); // 최근 턴시간: 현재시간
  var nextTurnStartTime = new Date(new Date().getTime() + 1000*60*sam_routineTime); // 1시간후
  var nextTurnTime = Utilities.formatDate(new Date(nextTurnStartTime), 'GMT+9', 'MM/dd HH:mm:ss'); // x시간후 - 포맷만 다르고 엑셀입력하면 값은 똑같음 (현재60분일걸)
  cell_nextTime.setValue(nextTurnStartTime); // 다음 턴시간: 1시간후
  
  // 새 로그 시작
  logtxt.push(["태풍이 몰아치던 어느 날, 공부하던 스터디원들이 납치되었습니다.", 0]);
  logtxt.push(["납치된 스터디원들은 바람에 흩날려 동북아시아의 어느 지역에 떨어졌습니다.", 0]);
  logtxt.push(["고개를 돌리던 스터디원들에게 하늘에서 쩌렁쩌렁한 목소리가 들려옵니다.", 0]);
  logtxt.push(["\"이곳에서 합격할 수 있는 사람은 싸워서 살아남는 마지막 한 명뿐이다.\"", 0]);
  logtxt.push(["\"한중일을 통일하라! 한중일을 모두 정복하는 자만이 공무원 시험에 합격할 수 있다!\"", 0]);
  logtxt.push(["그리하여 함께 공부하던 스터디원들은 동북아시아의 1인자가 되기 위해 자웅을 가리게 되는데...", 0]);
  logtxt.push(["첫 전투 예상 시간: " + nextTurnTime, 0]); // 예상 전투시간 보여줌
  writeLog(logtxt);

  // VIP 계산
  sam_vipRefresh();
  
}

// 게임 끝내기 / 게임 초기화 및 시작부 끝
/* ㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡㅡ */
// 루틴실행부

function sam_routine(debug, turns) {
 
  var debug = 'off';
  var reset = 'off';
  var debug_startNewGame = 'off'; // 이거 on으로 해놓으면 루프 실행 시 강제 게임 재시작임.
  
  var player = sam_player.getRange(3, 1, sam_player.getLastRow()-2, sam_player.getLastColumn()).getValues();
  var land = sam_land.getRange(3, 1, sam_land.getLastRow()-2, sam_land.getLastColumn()).getValues();

  var currTurn = cell_lastTurn.getValue(); // 게임 턴 변수 (종료:게임 종료됨 / 그외 숫자: 게임중)
  var server = cell_server.getValue(); // 서버상태 변수 (관리자가 IDLE/LOADING로 입력하여 게임을 진행/중단시킴)
  
  var lastTime = cell_recentTime.getValue(); // 기록된 마지막 턴 시작시간 ('최근 턴'란) (* 이게 전 턴 종료시각이다.)
  var elapsedHours = Math.floor((new Date() - new Date(lastTime))/(1000*60*60)); // 상기 마지막 턴시작시점으로부터 지난 총 시간량
  var elapsedMins = Math.floor((new Date() - new Date(lastTime))/(1000*60)); // 상기 마지막 턴시작시점으로부터 지난 총 분량
  var elapsedH = Math.floor(elapsedMins/60);
  var elapsedM = (elapsedMins % 60);
  if(debug == 'on') writeLog("[SYSTEM] 마지막 실행으로부터 " + elapsedHours + "시간 / " + elapsedH  + "시간 " + elapsedM + '분 지났습니다. debug = ' + debug);
  
  var nextTurn_raw = new Date(new Date().getTime() + 1000*60*sam_routineTime); // x분후 (현재60분일걸)
  var nextTurnTime = Utilities.formatDate(new Date(nextTurn_raw), 'GMT+9', 'MM/dd HH:mm:ss'); // x시간후 - 포맷만 다르고 엑셀입력하면 값은 똑같음 (현재60분일걸)
  
  // debugConsoleLog(new Date() + ", (last)Turn:" + currTurn + ", lastTime=" + lastTime + ", elapsed " + elapsedH  + "시간 " + elapsedM + '분 --- 루틴 진행합니다.');

  // 루프 0. game_chk(게임 시작/종료/트리거 등의 접촉관리)
  // 체크 루프를 돈다.
  
  // 1. 서버상태 점검부: 서버 OFF 게임을 임의로 멈췄다면
  // 2. 연산상태 점검부: LOADING / IDLE ? → LOADING 표기된이후 15분이 지났는가? 그리고 LOADING중인가?
  // 참고로 IDLE 상태면 여기 스킵함.
  if(server == 'OFF') { // 서버 상태가 OFF
    writeLog("[SYSTEM] 디버그 관계로 게임이 잠시 멈췄으며, 속행 예정입니다.");
    return; // 턴종료 행동이고 뭐고 그냥 바로 셧다운해라
  } else if(server == 'LOADING' && elapsedMins > sam_routineTime) { // 즉 연산이 진행중이고, 그 채로 한 루틴분량의 시간이 지났으면 → 틀림없이 중간에 뻑난거임
    writeLog("[SYSTEM] " + elapsedH  + "시간 " + elapsedM + '분이 지나도록 지난 턴을 마치지 못하였습니다. 에러가 나기 직전 턴으로 백섭합니다.');
    sam_backsub(1); // 백섭만 하고 재시도
    writeLog('[SYSTEM] 바로 전 장으로 백섭 완료하였습니다. 경기를 다시 진행합니다.');
  } else if(server == 'LOADING') {
    writeLog("[SYSTEM] 선행연산 진행중으로 중복연산 방지를 위해 본 루틴을 중단합니다.");
    return;
  }

  // 3. 새라운드 시작부: 겜 종료및 다음라운드 대기중?
  if(currTurn == '종료') { // 게임이 종료되어 다음 라운드를 기다리고 있는 상태라면 (턴 = '종료'일 때)
    // 현재시각이 게임 개시시각 ~ +8시간 범위 이내이거나, 아니면 그것과 상관없이 디버그모드가 켜져있다면
    if(elapsedHours > 24 || reset == 'on' || debug_startNewGame == 'on') {
      newgame_start(); // 아침 9시가 지났다면 새게임 스타트시킴. 0턴으로 시작하며, 밑에 메인루프를 돌면서 턴+1 되며 바로 게임 시작함.
      player = sam_player.getRange(3, 1, sam_player.getLastRow()-2, sam_player.getLastColumn()).getValues();
      land = sam_land.getRange(3, 1, sam_land.getLastRow()-2, sam_land.getLastColumn()).getValues();
    } else {
      return ;// 겜은 종료상태고 아직 정해진 시간이 안 되었다면 서버가 할게없다. 턴종료 행동이고 뭐고 그냥 바로 셧다운해라
    }
  }
  if(debug == 'on') writeLog("경기가 종료상태가 아닙니다. 다음 장을 정상진행합니다.");
  
  
  // 4. 여기까지 왔으면 서버는 켜져 있고, 생존자가 2명 이상 있다 즉 게임이 본격 정상진행중이라는 얘기다.
  // 새 턴을 진행한다. (* player, land, currTurn을 위에서 불러와서 갖고잇음)
  
  setMainStatus("loading"); // CALC = 로딩
  cell_recentTime.setValue(new Date()); // '최근 턴' ⇒ 현재 시각을 기록
  var logtxt = []; // 루틴을 끝내고 업데이트할 시스템 메세지 전체목록
  currTurn = cell_lastTurn.getValue(); // 게임상태 변수 (턴수에 따라 행동변화)
  currTurn = currTurn*1 + 1; // 새 턴을 진행키 위해 턴을 +1 해줌.

  
  // 4-0) 실행준비
  var logtxt = [];
  
  // 4-1) 전인원 beat 실행
  var returned_normal = beats_NORMAL(player, land, currTurn); // 일반회원용 beat 실행1
  land = returned_normal[0];
  logtxt = logtxt.concat(returned_normal[1]);
  
  // 4-2) vipPercent% 확률로 VIP용 beat 실행 (현재 10%일듯)
  if(sam_inf.getRange("AL20").getValue() != "전쟁 끝났다") { // 1) VIP의 경우에는 생존자가 있을 경우에만 진행
    var currLives = sam_inf.getRange("AL23").getValue();
    totalPerc = vipPercent + 50 * (sam_totalPlayers - currLives)/sam_totalPlayers;
    if(rndPercent(totalPerc) == true) {
      var returned_VIP = beats_VIP(player, land, currTurn);
      land = returned_VIP[0];
      logtxt = logtxt.concat(returned_VIP[1]);
    }
  }

  // 4-4) 로그반영 및 계기판 반영처리
  writeLog(logtxt); // 모든 로그를 sam_log에 반영한다.
  
  // 4-3) 전투결과로 얻어진 새 land를 db에 반영
  data_rewrite(sam_land, land);
  saveBattleLog(); // 전투기록 저장

  // 루프 5. 게임 종료 처리 판단한다.
  if(sam_inf.getRange("AL20").getValue() == "전쟁 끝났다") { // 1) 생존자가 없거나 한 명이라면 (lives = 1명 이하일 때)
    game_finish(); // 게임 끝내기처리
    return; // 메세지는 함수안에서 다 썼다.. 프로그램 다 종료시켜버려야됨.
  } else { // 2) 생존자가 충분하다면 (2명 이상인 정상 상황일 경우)
    writeLog("<<<서기 " + currTurn + "년이 이렇게 끝났습니다.>>> 현재 세력 " + sam_inf.getRange("AL23").getValue() + "강 구도, 다음 년도 시간: " + nextTurnTime); // 게임 종료 아닐 때
  }
  // 메인화면 내용을 기록한다.
  cell_recentTime.setValue(new Date()); // '최근 턴' ⇒ 현재 시각을 기록
  cell_nextTime.setValue(nextTurnTime); // '다음 턴' 란에 다음 시작시각 확실하게 박아놓기
  cell_lastTurn.setValue(currTurn); // TURN ⇒ 마지막으로 끝낸 턴 기입
  // 시스템의 완전한 종료.
  setMainStatus("idle");
}