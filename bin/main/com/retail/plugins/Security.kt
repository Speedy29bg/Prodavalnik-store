package com.retail.plugins

import io.ktor.server.application.*
import io.ktor.server.sessions.*
import io.ktor.server.auth.*
import io.ktor.server.response.*
import io.ktor.http.*
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable

@Serializable
data class UserSession(
    val userId: Int,
    val username: String,
    val role: String // "admin", "moderator", "client"
) : Principal

fun Application.configureSecurity() {
    install(Sessions) {
        cookie<UserSession>("USER_SESSION", SessionStorageMemory()) {
            cookie.path = "/"
            cookie.maxAgeInSeconds = 3600 // 1 hour
            cookie.httpOnly = true
            cookie.secure = false // Set to true in production with HTTPS
        }
    }
    
    install(Authentication) {
        session<UserSession>("auth-session") {
            validate { session ->
                session
            }
            challenge {
                call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Не сте оторизиран да извършите това действие"))
            }
        }
    }
}

// Extension to enforce role-based access control in routes
fun Route.withRole(vararg allowedRoles: String, build: Route.() -> Unit): Route {
    val authenticatedRoute = createChild(object : RouteSelector() {
        override fun evaluate(context: RoutingResolveContext, index: Int) = RouteSelectorEvaluation.Constant
    })
    
    authenticatedRoute.intercept(ApplicationCallPipeline.Plugins) {
        val session = call.sessions.get<UserSession>()
        if (session == null) {
            call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Моля, влезте в профила си"))
            finish()
        } else if (session.role !in allowedRoles) {
            call.respond(HttpStatusCode.Forbidden, mapOf("error" to "Нямате необходимите права (изисква се роля: ${allowedRoles.joinToString(" или ")})"))
            finish()
        }
    }
    
    authenticatedRoute.build()
    return authenticatedRoute
}
