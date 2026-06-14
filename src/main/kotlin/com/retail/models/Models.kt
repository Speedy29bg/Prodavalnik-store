package com.retail.models

import kotlinx.serialization.Serializable
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.javatime.datetime

// --- Exposed Database Tables ---

object RetailUsers : Table("retail_users") {
    val id = integer("id").autoIncrement()
    val username = varchar("username", 100).uniqueIndex()
    val passwordHash = varchar("password_hash", 255)
    val role = varchar("role", 50) // "admin", "moderator", "client"
    override val primaryKey = PrimaryKey(id)
}

object RetailStoreInfo : Table("retail_store_info") {
    val id = integer("id") // always 1
    val name = varchar("name", 255)
    val address = varchar("address", 500)
    override val primaryKey = PrimaryKey(id)
}

object RetailClients : Table("retail_clients") {
    val id = integer("id").autoIncrement()
    val userId = integer("user_id").references(RetailUsers.id)
    val clientNumber = varchar("client_number", 50).uniqueIndex()
    val firstName = varchar("first_name", 100)
    val lastName = varchar("last_name", 100)
    override val primaryKey = PrimaryKey(id)
}

object RetailBankAccounts : Table("retail_bank_accounts") {
    val id = integer("id").autoIncrement()
    val clientId = integer("client_id").references(RetailClients.id)
    val bankName = varchar("bank_name", 150)
    val accountNumber = varchar("account_number", 100)
    override val primaryKey = PrimaryKey(id)
}

object RetailSuppliers : Table("retail_suppliers") {
    val id = integer("id").autoIncrement()
    val name = varchar("name", 255)
    val address = varchar("address", 500)
    val phone = varchar("phone", 50)
    override val primaryKey = PrimaryKey(id)
}

object RetailItems : Table("retail_items") {
    val id = integer("id").autoIncrement()
    val name = varchar("name", 255)
    val price = double("price")
    val itemClass = varchar("item_class", 50) // "Budget", "Standard", "Premium"
    val category = varchar("category", 100)
    val description = text("description")
    override val primaryKey = PrimaryKey(id)
}

object RetailItemSuppliers : Table("retail_item_suppliers") {
    val itemId = integer("item_id").references(RetailItems.id)
    val supplierId = integer("supplier_id").references(RetailSuppliers.id)
    override val primaryKey = PrimaryKey(itemId, supplierId)
}

object RetailPromotions : Table("retail_promotions") {
    val id = integer("id").autoIncrement()
    val name = varchar("name", 255)
    val discountPercent = double("discount_percent") // e.g. 10.0 for 10%
    val startDate = datetime("start_date")
    val endDate = datetime("end_date")
    override val primaryKey = PrimaryKey(id)
}

object RetailPromotionItems : Table("retail_promotion_items") {
    val promotionId = integer("promotion_id").references(RetailPromotions.id)
    val itemId = integer("item_id").references(RetailItems.id)
    override val primaryKey = PrimaryKey(promotionId, itemId)
}

object RetailOrders : Table("retail_orders") {
    val id = integer("id").autoIncrement()
    val clientId = integer("client_id").references(RetailClients.id)
    val bankAccountId = integer("bank_account_id").references(RetailBankAccounts.id)
    val totalAmount = double("total_amount")
    val orderDate = datetime("order_date")
    val status = varchar("status", 50) // "pending", "paid"
    override val primaryKey = PrimaryKey(id)
}

object RetailOrderItems : Table("retail_order_items") {
    val id = integer("id").autoIncrement()
    val orderId = integer("order_id").references(RetailOrders.id)
    val itemId = integer("item_id").references(RetailItems.id)
    val quantity = integer("quantity")
    val unitPrice = double("unit_price")
    val discountAmount = double("discount_amount")
    val finalPrice = double("final_price")
    override val primaryKey = PrimaryKey(id)
}

// --- Serializable DTOs ---

@Serializable
data class UserDTO(
    val id: Int,
    val username: String,
    val role: String
)

@Serializable
data class StoreInfoDTO(
    val name: String,
    val address: String
)

@Serializable
data class BankAccountDTO(
    val id: Int,
    val clientId: Int,
    val bankName: String,
    val accountNumber: String
)

@Serializable
data class ClientDTO(
    val id: Int,
    val userId: Int,
    val clientNumber: String,
    val firstName: String,
    val lastName: String,
    val username: String? = null,
    val bankAccounts: List<BankAccountDTO> = emptyList()
)

@Serializable
data class SupplierDTO(
    val id: Int,
    val name: String,
    val address: String,
    val phone: String
)

@Serializable
data class ItemDTO(
    val id: Int,
    val name: String,
    val price: Double,
    val itemClass: String,
    val category: String,
    val description: String,
    val supplierIds: List<Int> = emptyList()
)

@Serializable
data class PromotionDTO(
    val id: Int,
    val name: String,
    val discountPercent: Double,
    val startDate: String, // ISO format
    val endDate: String,   // ISO format
    val itemIds: List<Int> = emptyList()
)

@Serializable
data class OrderItemDTO(
    val id: Int,
    val itemId: Int,
    val name: String? = null,
    val quantity: Int,
    val unitPrice: Double,
    val discountAmount: Double,
    val finalPrice: Double
)

@Serializable
data class OrderDTO(
    val id: Int,
    val clientId: Int,
    val bankAccountId: Int,
    val totalAmount: Double,
    val orderDate: String,
    val status: String,
    val items: List<OrderItemDTO> = emptyList()
)

@Serializable
data class OrderRequestItem(
    val itemId: Int,
    val quantity: Int
)

@Serializable
data class OrderCreateRequest(
    val bankAccountId: Int,
    val items: List<OrderRequestItem>
)

@Serializable
data class StoreInfoUpdateRequest(
    val name: String,
    val address: String
)

@Serializable
data class UserCreateRequest(
    val username: String,
    val passwordHash: String,
    val role: String
)

@Serializable
data class ClientRegisterRequest(
    val username: String,
    val passwordHash: String,
    val firstName: String,
    val lastName: String,
    val bankAccounts: List<BankAccountRequest> = emptyList()
)

@Serializable
data class BankAccountRequest(
    val bankName: String,
    val accountNumber: String
)

@Serializable
data class ItemCreateRequest(
    val name: String,
    val price: Double,
    val category: String,
    val description: String,
    val supplierIds: List<Int> = emptyList()
)

@Serializable
data class SupplierCreateRequest(
    val name: String,
    val address: String,
    val phone: String
)

@Serializable
data class PromotionCreateRequest(
    val name: String,
    val discountPercent: Double,
    val startDate: String,
    val endDate: String,
    val itemIds: List<Int> = emptyList()
)

// Statistics structures

@Serializable
data class CategoryStat(
    val category: String,
    val totalSold: Int,
    val totalRevenue: Double
)

@Serializable
data class OverallStats(
    val totalRevenue: Double,
    val totalOrders: Int,
    val totalClients: Int,
    val categoryStats: List<CategoryStat>
)
