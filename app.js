const express = require('express')
const request = require('request')
const bodyParser = require('body-parser')
const ConversationV1 = require('watson-developer-cloud/conversation/v1')
const path = require('path')
const bunyan = require('bunyan')
const config = require('./config.js')

const log = bunyan.createLogger(
  {
    name: 'myapp',
    streams: [
      {
        level: 'info',
        path: path.join(__dirname, 'bunyan.log')
      }
    ]
  }
)
const app = express()
let contexid = ''

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
app.use(express.static(path.join(__dirname, 'static')))

let conversationId

const conversation = new ConversationV1({
  username: process.env.CONVERSATION_USERNAME || config.CONVERSATION_USERNAME,
  password: process.env.CONVERSATION_PASSWORD || config.CONVERSATION_PASSWORD,
  version_date: '2016-07-01'
})
const workspaceId = process.env.WORKSPACE_ID || config.WORKSPACE_ID
const facebookToken = process.env.FACEBOOK_TOKEN || config.FACEBOOK_TOKEN

app.get('/webhook/', (req, res) => {
  if (req.query['hub.verify_token'] === facebookToken) {
    return res.send(req.query['hub.challenge'])
  }
  res.send('Error: Token validation error.')
})

app.post('/webhook/', (req, res) => {
  let text = null
  const messagingEvents = req.body.entry[0].messaging
  messagingEvents.some(event => {
    const sender = event.sender.id
    if (event.message && event.message.text) {
      text = event.message.text
    } else if (event.postback && !text) {
      text = event.postback.payload
    } else {
      return true
    }
    const params = {
      input: text && text.replace('\n', ''),
      // context: {"conversation_id": conversationId}
      context: contexid
    }
    const payload = {
      workspace_id: workspaceId,
      input: params.input && { text: params.input },
      context: params.context
    }
    callWatson(payload, sender)
  })
  res.sendStatus(200)
})

app.get('/', (req, res) => {
  res.send('Root path.')
})

function callWatson (payload, sender) {
  conversation.message(payload, (err, convResults) => {
    contexid = convResults.context
    if (err) {
      return log.info(`Error: ${err}`)
    }
    if (convResults.context !== null) {
      conversationId = convResults.context.conversation_id
    }
    if (convResults !== null && convResults.output !== null) {
      let i = 0
      while (i < convResults.output.text.length) {
        sendMessage(sender, convResults.output.text[i++])
      }
    }
  })
}

function sendMessage (sender, text) {
  const messageData = { text: text.substring(0, 319) }
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: facebookToken },
    method: 'POST',
    json: {
      recipient: { id: sender },
      message: messageData
    }
  }, function (error, response) {
    if (error) {
      log.info('Error sending message: ', error)
    } else if (response.body.error) {
      log.info('Error: ', response.body.error)
    }
  })
}

const host = process.env.VCAP_APP_HOST || 'localhost'
const port = process.env.PORT || 3000
app.listen(port, host)
