// This Jenkinsfile is dedicated to the jenkins job: Pizzly
// cf: https://jenkins.toucantoco.guru/job/Pizzly/
//
// This job is the CI for the Pizzly project

@Library('toucan-jenkins-lib')_
import com.toucantoco.ToucanVars

RELEASE_BRANCH_NAMES = [
    'master',
]

pipeline {
  agent any

  options {
    // Enable color in logs
    ansiColor('gnome-terminal')
  }

  environment {
    BUILD_RANDOM_ID = Math.round(Math.random() * 1000000)
  }

  stages {
    stage('Test') {
        steps {
            storeStage()
            sh 'make docker-test'
        }
    }

    stage('Prod stages') {
      when {
          expression {
            // Only when the latest commit messages is like vX.Y.Z
            // and the branch is declared in RELEASE_BRANCH_NAMES
            LAST_COMMIT_MESSAGE = sh(
              script: 'git log --format=%B -n 1',
              returnStdout: true
            ).trim()
            return RELEASE_BRANCH_NAMES.contains(BRANCH_NAME) && LAST_COMMIT_MESSAGE ==~ /v\d+\.\d+\.\d+$/
          }
      }

      stages {
        stage('Build toucantoco/pizzly prod') {
            steps {
                storeStage()
                sh 'make docker-build-prod'
            }
        }

        stage('Push toucantoco/pizzly prod') {
            steps {
              storeStage()
              // Create tag latest on the current pizzly version
              // And push on docker hub:
              //    - toucantoco/pizzly:$pizzly_VERSION
              //    - toucantoco/pizzly:latest
              sh "make push-to-registry PIZZLY_IMAGE_MORE_TAGS=latest"
            }
        }
      }
    }
  }

  post {
    failure {
      postSlackNotif()
    }

    always {
      // Store build result in a format parsable for our Elastic stack
      logKibana()
    }
  }
}
