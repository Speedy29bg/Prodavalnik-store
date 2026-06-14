package com.retail

import io.ktor.server.testing.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import kotlin.test.*
import io.ktor.http.*
import io.ktor.server.config.*

class ApplicationTest {
    @Test
    fun testRoot() = testApplication {
        environment {
            config = MapApplicationConfig(
                "database.driver" to "org.h2.Driver",
                "database.url" to "jdbc:h2:mem:test;DB_CLOSE_DELAY=-1",
                "database.user" to "sa",
                "database.password" to ""
            )
        }
        application {
            module()
        }
        val response = client.get("/")
        assertEquals(HttpStatusCode.OK, response.status)
        assertTrue(response.bodyAsText().contains("Мини<span>Маркет</span>"))
    }

    @Test
    fun testStoreInfoApi() = testApplication {
        environment {
            config = MapApplicationConfig(
                "database.driver" to "org.h2.Driver",
                "database.url" to "jdbc:h2:mem:test;DB_CLOSE_DELAY=-1",
                "database.user" to "sa",
                "database.password" to ""
            )
        }
        application {
            module()
        }
        val response = client.get("/api/store")
        assertEquals(HttpStatusCode.OK, response.status)
        assertTrue(response.bodyAsText().contains("Мини Маркет"))
    }
    
    @Test
    fun testUnauthorizedAccess() = testApplication {
        environment {
            config = MapApplicationConfig(
                "database.driver" to "org.h2.Driver",
                "database.url" to "jdbc:h2:mem:test;DB_CLOSE_DELAY=-1",
                "database.user" to "sa",
                "database.password" to ""
            )
        }
        application {
            module()
        }
        val response = client.get("/api/users")
        assertTrue(response.status == HttpStatusCode.Unauthorized || response.status == HttpStatusCode.Forbidden)
    }

    @Test
    fun testIbanValidationLogic() {
        assertTrue(com.retail.plugins.isValidIban("BG95UNCR96601012345678"))
        assertTrue(com.retail.plugins.isValidIban("BG54DSKB93001098765432"))
        assertFalse(com.retail.plugins.isValidIban("BG91UNCR96601012345679"))
        assertFalse(com.retail.plugins.isValidIban("BG12345678901234567890"))
        assertFalse(com.retail.plugins.isValidIban("INVALID"))
    }

    @Test
    fun testPasswordComplexityLogic() {
        assertTrue(com.retail.plugins.isValidPassword("Pass123"))
        assertTrue(com.retail.plugins.isValidPassword("SecureP@ssw0rd"))
        assertFalse(com.retail.plugins.isValidPassword("simple"))
        assertFalse(com.retail.plugins.isValidPassword("SIMPLE"))
        assertFalse(com.retail.plugins.isValidPassword("123456"))
        assertFalse(com.retail.plugins.isValidPassword("P1a"))
    }
}
